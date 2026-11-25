"""Research-only negative-result checkpoint. Never reuse coordinates or claim coverage."""
import datetime,hashlib,json
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()).hexdigest()
def fingerprint(e):return digest({k:e.get(k) for k in ('key','source','state','sourceDate','name','address','sourceCounty','status')})
class RecoveryCheckpoint:
    def __init__(self,prior=None,max_age_days=7):
        if not 0<=max_age_days<=7:raise ValueError('Checkpoint age limit')
        self.prior=prior or {};self.max_age_days=max_age_days;self.completed=False
        self.rows={};self.eligible={}
    def bind(self,source,version,checked):
        self.source=source;self.version=digest(version);self.checked=checked
        self.completed=False;self.rows={};self.eligible={}
        # Without a reliable edition marker, do not assume an unchanged service.
        marker=version.get('lastEditDate')
        if not marker or self.prior.get('schemaVersion')!=1 or self.prior.get('source')!=source or self.prior.get('metadataSha256')!=self.version or self.prior.get('completeMetadataCheck') is not True:return
        try:
            now=datetime.date.fromisoformat(checked)
            rows=self.prior['rows']
            if not isinstance(rows,dict):return
            for key,value in rows.items():
                if not isinstance(value,dict) or value.get('status')!='no-match':continue
                age=(now-datetime.date.fromisoformat(value['checkedAt'])).days
                if 0<=age<=self.max_age_days:self.eligible[key]=value
        except (ValueError,TypeError,KeyError):self.eligible={}
    def defer(self,e):
        old=self.eligible.get(e['key'])
        if old and old.get('fingerprint')==fingerprint(e):
            self.rows[e['key']]=old.copy();return True
        return False
    def record(self,e,status):
        # Positive, ambiguous and failed results are never reused as negative evidence.
        self.rows[e['key']]={'fingerprint':fingerprint(e),'status':status,'checkedAt':self.checked}
    def finish(self):self.completed=True
    def report(self):
        if not self.completed:raise ValueError('Source metadata verification not completed')
        return {'schemaVersion':1,'source':self.source,'metadataSha256':self.version,'completeMetadataCheck':True,'rows':self.rows}
