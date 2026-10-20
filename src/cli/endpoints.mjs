// T004 Phase A: observed descriptors. This module has no network access.
const exclusions = Object.freeze([
  '7310dd94-0395-48cb-845b-803279a54f6c',
  '96ca3348-49c2-4d89-903b-32939fd1c95c',
  'f464d614-c20e-4391-84a9-4c8edb7982a9'
]);
export const SCOPE = Object.freeze({ province: '54', district: '5406' });
export const ENDPOINTS = Object.freeze({
  assignments: Object.freeze({path:'/api/v1/dashboard/assignments',pagination:'assignment',personLevel:true,keyFields:['id']}),
  subdistricts: Object.freeze({path:'/api/v1/lookups/subdistricts',pagination:'none',personLevel:false,keyFields:['code']}),
  villages: Object.freeze({path:'/api/v1/lookups/villages',pagination:'none',personLevel:false,keyFields:['code']}),
  'health-services': Object.freeze({path:'/api/v1/geo-management/health-services',pagination:'offset',personLevel:false,keyFields:['health_service_code']}),
  'volunteer-gender': Object.freeze({path:'/api/v1/reports/volunteer-gender',pagination:'report',personLevel:false,keyFields:['provinceCode','districtCode','villageCode']}),
  'volunteer-family': Object.freeze({path:'/api/v1/reports/volunteer-family',pagination:'report',personLevel:true,keyFields:[]}),
  'resigned-volunteers': Object.freeze({path:'/api/v1/reports/resigned-volunteers',pagination:'report',personLevel:true,keyFields:['id']}),
  'volunteer-tenure': Object.freeze({path:'/api/v1/reports/volunteer-tenure',pagination:'report',personLevel:true,keyFields:['id']})
});
function bounded(value,name,max,lower=1){
  if(!Number.isSafeInteger(value)||value<lower||value>max) throw new TypeError(name+' must be an integer in '+lower+'..'+max);
}
export function buildRequest(endpoint,options={}){
  const d=ENDPOINTS[endpoint];
  if(!d)throw new TypeError('UNKNOWN_ENDPOINT');
  const {page=1,pageSize=10,offset=0}=options;
  bounded(page, 'page', 100000);
  bounded(pageSize,'pageSize',100);
  bounded(offset,'offset',1000000,0);
  const p=new URLSearchParams();
  if(d.pagination==='none'){
    if(page!==1||offset!==0)throw new TypeError('UNPAGINATED_LOOKUP');
    if(endpoint==='subdistricts')p.append('district_code',SCOPE.district);
    else {p.append('province_code',SCOPE.province);p.append('district_code',SCOPE.district);}
  }else if(d.pagination==='offset'){
    if(page!==1)throw new TypeError('OFFSET_ONLY');
    p.append('limit',String(pageSize));
    p.append('offset',String(offset));
    for(const value of exclusions)p.append('health_service_type_ids_exclude',value);
    p.append('province_code',SCOPE.province);
    p.append('district_code',SCOPE.district);
  }else if(d.pagination==='assignment'){
    if(offset!==0)throw new TypeError('PAGE_ONLY');
    p.append('page',String(page));
    p.append('pageSize',String(pageSize));
    p.append('provinceCode',SCOPE.province);
    p.append('districtCode',SCOPE.district);
    p.append('osmStatus','');
    p.append('osm_status','');
    p.append('approval_status','approved');
    p.append('order_by','approved_date');
    p.append('sort_dir','desc');
  }else{
    if(offset!==0)throw new TypeError('PAGE_ONLY');
    p.append('page',String(page));
    p.append('pageSize',String(pageSize));
    if(endpoint==='resigned-volunteers'||endpoint==='volunteer-tenure'){
      p.append('provinceCode',SCOPE.province);
      p.append('districtCode',SCOPE.district);
    }
    p.append('province',SCOPE.province);
    p.append('district',SCOPE.district);
  }
  // Return only allowlisted relative request data, never credentials or absolute network URLs.
  return Object.freeze({endpoint,path:d.path,query:p.toString(),page,offset,pageSize});
}
export function endpointNames(){return Object.keys(ENDPOINTS);}
