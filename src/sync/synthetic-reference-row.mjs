// Pure synthetic reference fixture builder for opt-in manual validate-only UAT.
// NEVER uses ThaiPHC APIs or real reference source rows.
export function syntheticReferenceRow(endpoint,manifest){
 if(!['subdistricts','villages','health-services'].includes(endpoint))
  throw Error('SYNTHETIC_REFERENCE_ENDPOINT_REQUIRED');
 const def=manifest?.datasets?.find(x=>x.api===endpoint);
 if(!def||!Array.isArray(def.fields))throw Error('SYNTHETIC_MANIFEST_REQUIRED');
 const r=Object.create(null);
 for(const f of def.fields){
  switch(f.observed_kind){
   case 'string':r[f.source_field]='SYNTHETIC';break;
   case 'string_or_null':case 'null_only':r[f.source_field]=null;break;
   case 'integer':r[f.source_field]=1;break;
   case 'number':r[f.source_field]=0;break;
   case 'object':r[f.source_field]={name_th:'SYNTHETIC'};break;
   case 'array':r[f.source_field]=[];break;
   default:throw Error('SYNTHETIC_KIND_UNSUPPORTED');
  }
 }
 if(endpoint==='subdistricts'){
  r.code='540601';r.id=r.code;r.district_code='5406';
  // Province code is observed null_only for subdistricts: preserve null.
 }else if(endpoint==='villages'){
  r.code='540601001';r.id=r.code;r.village_code_8digit='54060101';
  r.province_code='54';r.district_code='5406';r.subdistrict_code='540601';
 }else{
  r.health_service_code='SYNTHETIC-HS-001';
  r.legacy_5digit_code='00001';r.legacy_9digit_code='000000001';
  r.village_no='SYNTHETIC 1';
  r.province={province_code:'54',province_name_th:'SYNTHETIC'};
  r.district={district_code:'5406',district_name_th:'SYNTHETIC'};
  r.subdistrict={subdistrict_code:'540601',subdistrict_name_th:'SYNTHETIC'};
  r.health_service_type={id:'SYNTHETIC',name_th:'SYNTHETIC'};
  r.service_areas=[];r.latitude=0;r.longitude=0;
 }
 return r;
}
