import type { LngLat } from './types';

export interface MapFieldData {
  id: string; name: string; crop: string; ha: number; soil: string; privacy: string; sample: boolean; b: LngLat[]; p?: LngLat;
  /** Area already formatted for display ("600 m²"). */
  area: string;
}

export interface MapInit {
  ch: string;
  center: LngLat;
  zoom: number;
  fields: MapFieldData[];
  sel?: string;
  fit: boolean;
  interactive: boolean;
  /** Popup labels in the interface language. */
  lbl: { stage: string; area: string; ground: string; open: string; sample: string };
}

/**
 * Self-contained Leaflet page. Tiles: OpenStreetMap standard (HTTPS) with attribution.
 * Messages out: ready | tiles | error | select | open | nofields.
 * Messages in (window.__cmd): fields | fit | view | resize.
 */
export function buildMapHtml(init: MapInit): string {
  const json = JSON.stringify(init).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
html,body,#m{margin:0;padding:0;height:100%;width:100%;background:#E7E5DE;font-family:-apple-system,system-ui,sans-serif}
.lbl{background:rgba(22,24,28,.86);color:#FFFFFF;border:0;border-radius:8px;font-weight:700;font-size:11px;padding:2px 7px;box-shadow:none}
.lbl:before{display:none}
.pp{min-width:170px;color:#16181C}
.pp h4{margin:0 0 6px;font-size:15px}
.pp .r{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:2px 0;border-bottom:1px solid #E7E5DE}
.pp .r b{font-weight:600}
.pp .tag{display:inline-block;background:#F59F00;color:#16181C;font-size:10px;font-weight:800;letter-spacing:.6px;border-radius:6px;padding:2px 6px;margin-bottom:6px}
.pp button{margin-top:9px;width:100%;background:#16181C;color:#FFC02E;border:0;border-radius:10px;padding:9px;font-weight:700;font-size:13px}
.leaflet-container a.leaflet-popup-close-button{font-size:20px}
</style>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
</head><body><div id="m"></div>
<script>
(function(){
var I=${json};var CH=I.ch;
function send(m){m.ch=CH;var s=JSON.stringify(m);
 if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}
 else if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');}}
if(!window.L){send({type:'error',reason:'leaflet'});return;}
var map=L.map('m',{zoomControl:I.interactive,attributionControl:true,dragging:I.interactive,scrollWheelZoom:I.interactive,doubleClickZoom:I.interactive,touchZoom:I.interactive,boxZoom:false,keyboard:false,tap:true}).setView([I.center[1],I.center[0]],I.zoom);
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
L.control.scale({metric:true,imperial:false}).addTo(map);
var gotTile=false,errs=0;
tiles.on('tileload',function(){if(!gotTile){gotTile=true;send({type:'tiles'});}});
tiles.on('tileerror',function(){errs++;if(!gotTile&&errs===8){send({type:'error',reason:'tiles'});}});
var COLORS=['#E8590C','#F59F00','#2F7FD8','#7A5AF8','#2C3139'];
var layer=L.featureGroup().addTo(map);
var data=I.fields,sel=I.sel;
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var LB=I.lbl;
function popup(f){return '<div class="pp">'+(f.sample?'<span class="tag">'+esc(LB.sample)+'</span>':'')+'<h4>'+esc(f.name)+'</h4>'+
 '<div class="r"><span>'+esc(LB.stage)+'</span><b>'+esc(f.crop)+'</b></div>'+
 '<div class="r"><span>'+esc(LB.area)+'</span><b>'+esc(f.area)+'</b></div>'+
 '<div class="r"><span>'+esc(LB.ground)+'</span><b>'+esc(f.soil)+'</b></div>'+
 '<button onclick="window.__open(\\''+esc(f.id)+'\\')">'+esc(LB.open)+'</button></div>';}
window.__open=function(id){send({type:'open',id:id});};
function centroid(b){var x=0,y=0;b.forEach(function(p){x+=p[0];y+=p[1];});return [y/b.length,x/b.length];}
// Permanent name labels only when zoomed in; at country/world scale they pile up, so they show on hover/tap instead.
var LBL_Z=9,lblOn=null;
map.on('zoomend',function(){if((map.getZoom()>=LBL_Z)!==lblOn)draw();});
function draw(){layer.clearLayers();lblOn=map.getZoom()>=LBL_Z;
 data.forEach(function(f,i){var on=f.id===sel;
  // Without an outline, a field known only by its village is a pin there.
  if((!f.b||f.b.length<3)&&f.p){var pin=L.circleMarker([f.p[1],f.p[0]],{radius:9,color:'#FFFFFF',weight:3,fillColor:'#16181C',fillOpacity:1});
   pin.bindTooltip(esc(f.name),{permanent:lblOn,direction:'top',className:'lbl'});pin.bindPopup(popup(f));
   pin.on('click',function(){sel=f.id;send({type:'select',id:f.id});});pin.addTo(layer);return;}
  if(!f.b||f.b.length<3)return;
  var pg=L.polygon(f.b.map(function(p){return [p[1],p[0]];}),{color:on?'#16181C':'#16181C',weight:on?3.5:1.6,fillColor:COLORS[i%5],fillOpacity:on?0.72:0.48});
  var mk=L.circleMarker(centroid(f.b),{radius:on?8:6,color:'#FFFFFF',weight:2,fillColor:on?'#FFC02E':'#16181C',fillOpacity:1});
  {
   pg.bindTooltip(esc(f.name)+(f.sample?' (sample)':''),{permanent:lblOn,direction:'center',className:'lbl'});
   var pu=popup(f);pg.bindPopup(pu);mk.bindPopup(pu);
   var pick=function(){sel=f.id;send({type:'select',id:f.id});};pg.on('click',pick);mk.on('click',pick);
  }
  pg.addTo(layer);mk.addTo(layer);});}
function fit(){var n=0;layer.eachLayer(function(){n++;});if(!n){send({type:'nofields'});return;}map.fitBounds(layer.getBounds(),{padding:[36,36],maxZoom:16});}
window.__cmd=function(m){try{
 if(m.cmd==='fields'){data=m.fields||[];sel=m.sel;draw();}
 else if(m.cmd==='fit'){fit();}
 else if(m.cmd==='view'){map.setView([m.center[1],m.center[0]],m.zoom);}
 else if(m.cmd==='resize'){map.invalidateSize();}
}catch(e){}};
window.addEventListener('message',function(e){try{var m=typeof e.data==='string'?JSON.parse(e.data):e.data;if(m&&m.ch===CH&&m.cmd)window.__cmd(m);}catch(_){}});
draw();
if(I.fit)fit();
send({type:'ready'});
})();
</script></body></html>`;
}
