export function publicAgencyProfilePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const publicPayload = { ...payload };
  for (const key of [
    "fieldNotes",
    "followUpTasks",
    "sourceRecordAssociations",
    "sourceFacts",
    "_factReviews",
    "_reviewOriginalValues",
  ]) {
    delete publicPayload[key];
  }
  if (Array.isArray(publicPayload.keyContacts)) {
    publicPayload.keyContacts = publicPayload.keyContacts.map((contact) => {
      if (!contact || typeof contact !== "object" || Array.isArray(contact)) return contact;
      const publicContact = { ...(contact as Record<string, unknown>) };
      delete publicContact.notes;
      return publicContact;
    });
  }
  return publicPayload;
}
