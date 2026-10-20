// Explicitly synthetic fixture generation only. Never calls global fetch/network.
import { ENDPOINTS, SCOPE } from './endpoints.mjs';
const SIMULATOR=Symbol('synthetic-mock');
export function createMockTransport(handler){
  if(typeof handler!=='function')throw new TypeError('MOCK_HANDLER_REQUIRED');
  const wrapped=async(request)=>handler(request);
  Object.defineProperty(wrapped,SIMULATOR,{value:true});
  return wrapped;
}
export function isMockTransport(fn){return typeof fn==='function'&&fn[SIMULATOR]===true;}

function syntheticRow(endpoint,i){
  const village=String(i+1).padStart(3,'0');
  const geography={
    provinceCode:SCOPE.province,districtCode:SCOPE.district,
    subdistrictCode:'540608',villageCode:'540608'+village,
    villageNo:String(i+1)
  };
  if(endpoint==='subdistricts')return {code:'540608',id:'540608',district_code:SCOPE.district};
  if(endpoint==='villages')return {code:'540608'+village,subdistrict_code:'540608',district_code:SCOPE.district,village_no:i+1};
  if(endpoint==='health-services')return {health_service_code:'SYNTHETIC-HS-'+String(i+1).padStart(3,'0'),province:{province_code:SCOPE.province},district:{district_code:SCOPE.district},subdistrict:{subdistrict_code:'540608'},service_areas:[],latitude:0,longitude:0};
  if(endpoint==='volunteer-gender')return {...geography,total:5,male:2,female:3};
  if(endpoint==='volunteer-family')return {...geography,volunteerId:'SYNTHETIC-VOLUNTEER',status:'child'};
  if(endpoint==='assignments')return {...geography,id:'SYNTHETIC-ID-'+(i+1),villageName:null,osmStatus:''};
  if(endpoint==='resigned-volunteers')return {...geography,id:'SYNTHETIC-ID-'+(i+1),retirementReason:'resigned',osmStatus:'0'};
  return {...geography,id:'SYNTHETIC-ID-'+(i+1),startYear:2560,osmYear:2560,tenureYears:9,retirementDate:null};
}
export function syntheticTransport(endpoint){
  const d=ENDPOINTS[endpoint];
  if(!d)throw new TypeError('UNKNOWN_ENDPOINT');
  return createMockTransport(async request=>{
    if(request.endpoint!==endpoint||request.path!==d.path)return {status:400,body:{}};
    const q=new URLSearchParams(request.query);
    const size=d.pagination==='none'?2:Number(q.get(d.pagination==='offset'?'limit':'pageSize'));
    const start=d.pagination==='none'?0:d.pagination==='offset'?Number(q.get('offset')):(Number(q.get('page'))-1)*size;
    const total=d.pagination==='none'?1:5;
    const rows=Array.from({length:Math.max(0,Math.min(size,total-start))},(_,j)=>syntheticRow(endpoint,start+j));
    if(d.pagination==='none')return {status:200,body:{items:rows}};
    if(d.pagination==='offset')return {status:200,body:{items:rows,total,limit:size,offset:start}};
    if(d.pagination==='assignment')return {status:200,body:{items:rows,provinces:[],pagination:{page:Number(q.get('page')),limit:size,total,pages:Math.ceil(total/size)}}};
    return {status:200,body:{success:true,message:'Success',items:rows,total,page:Number(q.get('page')),pageSize:size}};
  });
}
