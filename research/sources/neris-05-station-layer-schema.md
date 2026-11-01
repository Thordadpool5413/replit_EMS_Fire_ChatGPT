Source: https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer/1?f=pjson
Title: 
Fetched: 2026-11-01T05:14:05.645Z

```json
{
  "currentVersion" : 12, 
  "id" : 1, 
  "name" : "Station", 
  "inDedicatedHosting" : true, 
  "preferredHost" : "lpbcyjocolyzmvo6.svcs5.arcgis.com", 
  "type" : "Feature Layer", 
  "serviceItemId" : "0ac459746be44023a1b33ba00bb5f628", 
  "cacheMaxAge" : 30, 
  "isView" : true, 
  "isUpdatableView" : true, 
  "sourceSchemaChangesAllowed" : true, 
  "displayField" : "", 
  "description" : "", 
  "copyrightText" : "", 
  "defaultVisibility" : true, 
  "editingInfo" : {
    "lastEditDate" : 1793502467775, 
    "schemaLastEditDate" : 1793502467775, 
    "dataLastEditDate" : 1793502467775
  }, 
  "relationships" : [
    {
      "id" : 0, 
      "name" : "Department_Station", 
      "relatedTableId" : 0, 
      "cardinality" : "esriRelCardinalityOneToMany", 
      "role" : "esriRelRoleDestination", 
      "keyField" : "department_neris_id", 
      "composite" : false
    }, 
    {
      "id" : 1, 
      "name" : "Station_Unit", 
      "relatedTableId" : 3, 
      "cardinality" : "esriRelCardinalityOneToMany", 
      "role" : "esriRelRoleOrigin", 
      "keyField" : "neris_id", 
      "composite" : false
    }
  ], 
  "isDataVersioned" : false, 
  "hasContingentValuesDefinition" : false, 
  "supportsAppend" : true, 
  "supportsCalculate" : true, 
  "supportsASyncCalculate" : true, 
  "supportsTruncate" : false, 
  "supportsAttachmentsByUploadId" : true, 
  "supportsAttachmentsResizing" : true, 
  "supportsRollbackOnFailureParameter" : true, 
  "supportsStatistics" : true, 
  "supportsExceedsLimitStatistics" : true, 
  "supportsAdvancedQueries" : true, 
  "supportsValidateSql" : true, 
  "supportsCoordinatesQuantization" : true, 
  "supportsLayerOverrides" : true, 
  "supportsTilesAndBasicQueriesMode" : true, 
  "supportsFieldDescriptionProperty" : true, 
  "supportsQuantizationEditMode" : true, 
  "supportsColumnStoreIndex" : true, 
  "supportsApplyEditsWithGlobalIds" : false, 
  "supportsReturningQueryGeometry" : true, 
  "enableNullGeometry" : false, 
  "advancedQueryCapabilities" : {
    "supportsPagination" : true, 
    "supportsPaginationOnAggregatedQueries" : true, 
    "supportsQueryRelatedPagination" : true, 
    "supportsQueryWithDistance" : true, 
    "supportsOutDistance" : true, 
    "supportsReturningQueryExtent" : true, 
    "supportsStatistics" : true, 
    "supportsOrderBy" : true, 
    "supportsDistinct" : true, 
    "supportsQueryWithResultType" : true, 
    "supportsSqlExpression" : true, 
    "supportsTimeRelation" : true, 
    "supportsAdvancedQueryRelated" : true, 
    "supportsCountDistinct" : true, 
    "supportsPercentileStatistics" : true, 
    "supportsApproxPercentileStatistics" : true, 
    "supportsSpatialAggregationStatistics" : true, 
    "supportedSpatialAggregationStatistics" : [
      "EnvelopeAggregate", 
      "CentroidAggregate", 
      "ConvexHullAggregate"
    ], 
    "supportsLod" : true, 
    "supportsQueryWithLodSR" : false, 
    "supportedLodTypes" : [
      "geohash"
    ], 
    "supportsReturningGeometryCentroid" : false, 
    "supportsReturningGeometryEnvelope" : false, 
    "supportsQueryWithDatumTransformation" : true, 
    "supportsCurrentUserQueries" : true, 
    "supportsHavingClause" : true, 
    "supportsOutFieldSQLExpression" : true, 
    "supportsMaxRecordCountFactor" : true, 
    "supportsTopFeaturesQuery" : true, 
    "supportsDisjointSpatialRel" : true, 
    "supportsQueryWithCacheHint" : true, 
    "supportedOperationsWithCacheHint" : [
      "query", 
      "queryTopFilter", 
      "queryAnalytics", 
      "queryAttachments", 
      "queryRelated", 
      "queryBins", 
      "queryPivot"
    ], 
    "supportsQueryAnalytic" : true, 
    "supportsQueryPivot" : true, 
    "supportsQueryBins" : true, 
    "supportsDefaultSR" : true, 
    "supportsTranslations" : false, 
    "supportsAggIds" : true, 
    "supportsQueryWithCollation" : true, 
    "supportsISODOW" : true, 
    "supportsISOWeek" : true, 
    "supportsFullTextSearch" : true, 
    "fullTextSearchCapabilities" : {
      "supportsAccentSensitivity" : true, 
      "supportsStopWords" : true, 
      "supportsSearchOperator" : true, 
      "supportsOperator" : true
    }
  }, 
  "advancedQueryAnalyticCapabilities" : {
    "supportsLinearRegression" : true, 
    "supportsTrendlineRegression" : true, 
    "supportsAsync" : true, 
    "supportsPercentileAnalytic" : true
  }, 
  "queryBinsCapabilities" : {
    "supportsAsync" : true, 
    "supportsAutoIntervalBin" : true, 
    "supportsFixedIntervalBin" : true, 
    "supportsFixedBoundariesBin" : true, 
    "supportsDateBin" : true, 
    "supportsClassificationBin" : true, 
    "supportsStackBy" : true, 
    "supportsSplitBy" : true, 
    "supportsFirstDayOfWeek" : true, 
    "supportsSnapToData" : true, 
    "supportsReturnFullIntervalBin" : true, 
    "supportsReturnStackValueRange" : true, 
    "supportsNormalization" : true, 
    "supportedStatisticTypes" : [
      "COUNT", 
      "SUM", 
      "AVG", 
      "VAR", 
      "STDDEV", 
      "MIN", 
      "MAX", 
      "PERCENTILE_CONT", 
      "PERCENTILE_DISC", 
      "APPROX_PERCENTILE_CONT", 
      "APPROX_PERCENTILE_DISC", 
      "CentroidAggregate", 
      "EnvelopeAggregate", 
      "ConvexHullAggregate"
    ], 
    "supportedNormalizationTypes" : [
      "boxCox", 
      "field", 
      "inverse", 
      "log", 
      "naturalLog", 
      "percentOfTotal", 
      "squareRoot"
    ]
  }, 
  "supportedOperationsWithCollation" : "query,addField,updateField", 
  "advancedEditingCapabilities" : {
    "supportedSqlFormatsInCalculate" : [
      "standard"
    ], 
    "supportsAsyncApplyEdits" : true, 
    "supportsReturnEditResults" : true, 
    "supportsApplyEditsbyUploadID" : true, 
    "supportedApplyEditsUploadIDFormats" : "JSON,PBF", 
    "supportsTranslation" : false, 
    "supportsMaxTranslations" : 10
  }, 
  "infoInEstimates" : [
    "extent", 
    "count"
  ], 
  "useStandardizedQueries" : true, 
  "geometryType" : "esriGeometryPoint", 
  "minScale" : 0, 
  "maxScale" : 0, 
  "extent" : {
    "xmin" : -18957416.623153195, 
    "ymin" : -30240971.958386146, 
    "xmax" : 18672532.123775177, 
    "ymax" : 18763381.041431189, 
    "spatialReference" : {
      "wkid" : 102100, 
      "latestWkid" : 3857
    }
  }, 
  "spatialReference" : {
    "wkid" : 102100, 
    "latestWkid" : 3857
  }, 
  "drawingInfo":{"renderer":{"type":"simple","symbol":{"type":"esriPMS","url":"OrangeSphere.png","imageData":"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","contentType":"image/png","width":15,"height":15}}}, 
  "allowGeometryUpdates" : true, 
  "hasAttachments" : false, 
  "viewSourceHasAttachments" : false, 
  "htmlPopupType" : "esriServerHTMLPopupTypeNone", 
  "hasMetadata" : true, 
  "hasM" : false, 
  "hasZ" : false, 
  "objectIdField" : "OBJECTID", 
  "uniqueIdField" : 
  {
    "name" : "OBJECTID", 
    "isSystemMaintained" : true
  }, 
  "globalIdField" : "", 
  "typeIdField" : "", 
  "collation" : {
    "locale" : "neutral", 
    "caseSensitive" : false, 
    "accentSensitive" : true
  }, 
  "fields" : [
    {
      "name" : "OBJECTID", 
      "type" : "esriFieldTypeOID", 
      "alias" : "OBJECTID", 
      "sqlType" : "sqlTypeOther", 
      "nullable" : false, 
      "editable" : false, 
      "domain" : null, 
      "defaultValue" : "", 
      "required" : true
    }, 
    {
      "name" : "neris_id", 
      "type" : "esriFieldTypeString", 
      "alias" : "neris_id", 
      "sqlType" : "sqlTypeOther", 
      "length" : 14, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "station_name", 
      "type" : "esriFieldTypeString", 
      "alias" : "station_name", 
      "sqlType" : "sqlTypeOther", 
      "length" : 255, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "address_line_1", 
      "type" : "esriFieldTypeString", 
      "alias" : "address_line_1", 
      "sqlType" : "sqlTypeOther", 
      "length" : 255, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "address_line_2", 
      "type" : "esriFieldTypeString", 
      "alias" : "address_line_2", 
      "sqlType" : "sqlTypeOther", 
      "length" : 255, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "city", 
      "type" : "esriFieldTypeString", 
      "alias" : "city", 
      "sqlType" : "sqlTypeOther", 
      "length" : 255, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "state", 
      "type" : "esriFieldTypeString", 
      "alias" : "state", 
      "sqlType" : "sqlTypeOther", 
      "length" : 2, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "zip_code", 
      "type" : "esriFieldTypeString", 
      "alias" : "zip_code", 
      "sqlType" : "sqlTypeOther", 
      "length" : 10, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "unit_count", 
      "type" : "esriFieldTypeSmallInteger", 
      "alias" : "unit_count", 
      "sqlType" : "sqlTypeOther", 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "department_neris_id", 
      "type" : "esriFieldTypeString", 
      "alias" : "department_neris_id", 
      "sqlType" : "sqlTypeOther", 
      "length" : 10, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "department_name", 
      "type" : "esriFieldTypeString", 
      "alias" : "department_name", 
      "sqlType" : "sqlTypeOther", 
      "length" : 255, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : ""
    }, 
    {
      "name" : "export_date", 
      "type" : "esriFieldTypeDate", 
      "alias" : "export_date", 
      "sqlType" : "sqlTypeOther", 
      "length" : 8, 
      "nullable" : true, 
      "editable" : true, 
      "domain" : null, 
      "defaultValue" : "", 
      "precision" : 1
    }
  ], 
  "indexes" : [
    {
      "name" : "GDB_4_department_neris_id", 
      "fields" : "department_neris_id", 
      "isAscending" : true, 
      "isUnique" : false, 
      "description" : "", 
      "indexType" : "Attribute"
    }, 
    {
      "name" : "GDB_4_neris_id", 
      "fields" : "neris_id", 
      "isAscending" : true, 
      "isUnique" : false, 
      "description" : "", 
      "indexType" : "Attribute"
    }, 
    {
      "name" : "PK__NERIS_PU__F4B70D85C864F584", 
      "fields" : "OBJECTID", 
      "isAscending" : true, 
      "isUnique" : true, 
      "description" : "clustered, unique, primary key", 
      "indexType" : "Attribute"
    }, 
    {
      "name" : "user_88350.NERIS_PUBLIC_FIRE_DEPARTMENTS_A_STATION2_Shape_sidx", 
      "fields" : "Shape", 
      "isAscending" : true, 
      "isUnique" : false, 
      "description" : "Shape Index", 
      "indexType" : "Spatial"
    }
  ], 
  "dateFieldsTimeReference" : {
    "timeZone" : "UTC", 
    "timeZoneIANA" : "Etc/UTC", 
    "respectsDaylightSaving" : false
  }, 
  "preferredTimeReference" : null, 
  "types" : [], 
  "templates" : [
    {
      "name" : "New Feature", 
      "description" : "", 
      "drawingTool" : "esriFeatureEditToolPoint", 
      "prototype" : {
        "attributes" : {
          "neris_id" : null, 
          "station_name" : null, 
          "address_line_1" : null, 
          "address_line_2" : null, 
          "city" : null, 
          "state" : null, 
          "zip_code" : null, 
          "unit_count" : null, 
          "department_neris_id" : null, 
          "department_name" : null, 
          "export_date" : null
        }
      }
    }
  ], 
  "supportedQueryFormats" : "JSON, geoJSON, PBF", 
  "supportedAppendFormats" : "sqlite,geoPackage,shapefile,filegdb,featureCollection,geojson,csv,excel,jsonl,featureService,pbf", 
  "supportedAppendSourceFilterFormats" : "sqlite,geoPackage,shapefile,filegdb,featureService", 
  "supportedExportFormats" : "csv,shapefile,sqlite,geoPackage,filegdb,featureCollection,geojson,kml,excel,parquet", 
  "supportedConvertFileFormats" : "JSON,PBF,Parquet", 
  "supportedConvertContentFormats" : "LayerEditCollection,FeatureCollection", 
  "supportedSpatialRelationships" : [
    "esriSpatialRelIntersects", 
    "esriSpatialRelContains", 
    "esriSpatialRelCrosses", 
    "esriSpatialRelEnvelopeIntersects", 
    "esriSpatialRelIndexIntersects", 
    "esriSpatialRelOverlaps", 
    "esriSpatialRelTouches", 
    "esriSpatialRelWithin", 
    "esriSpatialRelDisjoint", 
    "esriSpatialRelRelation"
  ], 
  "guidFormat" : "", 
  "supportsContingentValues" : true, 
  "supportsEditingContingentValues" : true, 
  "supportedContingentValuesFormats" : "JSON, PBF", 
  "supportsFieldGroups" : true, 
  "supportedSyncDataOptions" : 260, 
  "hasStaticData" : false, 
  "maxRecordCount" : 1000, 
  "standardMaxRecordCount" : 16000, 
  "maxIdsCount" : 1000000, 
  "standardMaxRecordCountNoGeometry" : 32000, 
  "tileMaxRecordCount" : 8000, 
  "maxRecordCountFactor" : 1, 
  "capabilities" : "Query,Extract", 
  "layerOverrides" : [
    "capabilities"
  ]
}
```