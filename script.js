const CHANNEL_ID = '3029174';
const READ_API_KEY = 'JHYIGI9QFA6EQG1F';
const THINGSPEAK_FEED_URL =
  `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${READ_API_KEY}&results=100`;

const THRESHOLDS = {
  pm25: 35,
  pm10: 50,
  temp_air_high: 30,
  temp_air_low: -5
};

let tempChart = null;
let pmChart = null;
let tempData = [];
let pmData = [];

function initCharts() {
  const tCanvas = document.getElementById('tempChart');
  const pCanvas = document.getElementById('pmChart');
  if (!tCanvas || !pCanvas) return;

  const tCtx = tCanvas.getContext('2d');
  const pCtx = pCanvas.getContext('2d');

  tempChart = new Chart(tCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: '온도 (℃)', data: [], borderColor: '#ff6384', tension: 0.3, fill: false }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false } } }
  });

  pmChart = new Chart(pCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'PM2.5 (µg/m³)', data: [], borderColor: '#36a2eb', tension: 0.3, fill: false }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false } } }
  });
}

// CSV 변환/다운로드
function feedsToCSV(feeds) {
  const headers = ['created_at', 'temperature_air','humidity_air','pressure_air','pm2_5','pm10','temperature_water'];
  const rows = feeds.map(f => [f.created_at, f.field1||'', f.field2||'', f.field3||'', f.field4||'', f.field5||'', f.field6||'']);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  return csv;
}

function downloadCSV(text, filename='thingspeak_export.csv'){
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Notification
function requestNotificationPermission(){
  if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
  Notification.requestPermission().then(p => alert('알림 권한: ' + p));
}

// Unit conversion
let showFahrenheit = false;
function cToF(c){ return (c*9/5)+32; }

// Cache key
const CACHE_KEY = 'thing_speak_last_response';

async function fetchSensorData() {
  try {
    const response = await fetch(THINGSPEAK_FEED_URL);
    const data = await response.json();
    const feeds = data.feeds;

    if (!feeds || feeds.length === 0) {
      console.warn('ThingSpeak: 가져온 데이터가 없습니다.');
      return;
    }

    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e){/* ignore */}

    processFeeds(feeds);
    updateLastUpdated(new Date());
  } catch (error) {
    console.error('ThingSpeak 데이터 불러오기 오류:', error);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.feeds) { processFeeds(data.feeds, true); updateLastUpdated(new Date('1970-01-01')); }
      }
    } catch(e){ console.error('캐시 복원 실패', e); }
  }
}

function updateLastUpdated(date){
  const el = document.getElementById('last-updated');
  if (!el) return;
  if (date.getFullYear()===1970) el.textContent = '마지막 업데이트: (오프라인, 캐시)';
  else el.textContent = '마지막 업데이트: ' + date.toLocaleString();
}

function processFeeds(feeds, fromCache=false){
  let sums = { temp_air:0, hum_air:0, pres_air:0, pm25:0, pm10:0, temp_water:0 };
  let counts = { temp_air:0, hum_air:0, pres_air:0, pm25:0, pm10:0, temp_water:0 };
  tempData = []; pmData = [];

  feeds.forEach(f => {
    const t = parseFloat(f.field1);
    const h = parseFloat(f.field2);
    const p = parseFloat(f.field3);
    const pm2_5 = parseFloat(f.field4);
    const pm10 = parseFloat(f.field5);
    const tw = parseFloat(f.field6);

    if (!isNaN(t)){ sums.temp_air+=t; counts.temp_air++; tempData.push({x:f.created_at,y:t}); }
    if (!isNaN(h)){ sums.hum_air+=h; counts.hum_air++; }
    if (!isNaN(p)){ sums.pres_air+=p; counts.pres_air++; }
    if (!isNaN(pm2_5)){ sums.pm25+=pm2_5; counts.pm25++; pmData.push({x:f.created_at,y:pm2_5}); }
    if (!isNaN(pm10)){ sums.pm10+=pm10; counts.pm10++; }
    if (!isNaN(tw)){ sums.temp_water+=tw; counts.temp_water++; }
  });

  const avg = key => counts[key] ? (sums[key]/counts[key]) : null;
  const avgTemp = avg('temp_air');
  const avgHum = avg('hum_air');
  const avgPres = avg('pres_air');
  const avgPm25 = avg('pm25');
  const avgPm10 = avg('pm10');
  const avgTempWater = avg('temp_water');

  const displayTemp = avgTemp !== null ? (showFahrenheit? cToF(avgTemp).toFixed(1)+'℉': avgTemp.toFixed(1)+'℃') : '--℃';
  document.getElementById('temperature').textContent = avgTemp!==null? displayTemp : '--℃';
  document.getElementById('humidity').textContent = avgHum!==null? avgHum.toFixed(1)+'%':'--%';
  document.getElementById('pressure').textContent = avgPres!==null? avgPres.toFixed(1)+' hPa':'---- hPa';
  document.getElementById('pm25').textContent = avgPm25!==null? avgPm25.toFixed(1)+' µg/m³':'-- µg/m³';
  document.getElementById('pm10').textContent = avgPm10!==null? avgPm10.toFixed(1)+' µg/m³':'-- µg/m³';
  document.getElementById('temperature_water').textContent = avgTempWater!==null? avgTempWater.toFixed(1)+'℃':'--℃';

  applyAlerts(avgPm25, avgPm10, avgTemp);

  const recentTemp = tempData.slice(-50).map(d=>({t:new Date(d.x), y:d.y}));
  const recentPm = pmData.slice(-50).map(d=>({t:new Date(d.x), y:d.y}));
  if (tempChart){
    tempChart.data.labels = recentTemp.map(d=>d.t.toLocaleTimeString());
    tempChart.data.datasets[0].data = recentTemp.map(d=>d.y);
    tempChart.update();
  }
  if (pmChart){
    pmChart.data.labels = recentPm.map(d=>d.t.toLocaleTimeString());
    pmChart.data.datasets[0].data = recentPm.map(d=>d.y);
    pmChart.update();
  }

  window._lastFeeds = feeds;
}

function applyAlerts(pm25, pm10, temp){
  const pm25El = document.getElementById('pm25');
  const pm10El = document.getElementById('pm10');
  const tempEl = document.getElementById('temperature');
  if (!pm25El || !pm10El || !tempEl) return;

  const pm25Card = pm25El.closest('.card');
  const pm10Card = pm10El.closest('.card');
  const tempCard = tempEl.closest('.card');

  const setClass = (el, cond) => { if(!el) return; if(cond) el.classList.add('alert'); else el.classList.remove('alert'); };
  setClass(pm25Card, pm25!==null && pm25>THRESHOLDS.pm25);
  setClass(pm10Card, pm10!==null && pm10>THRESHOLDS.pm10);
  setClass(tempCard, temp!==null && (temp>THRESHOLDS.temp_air_high || temp<THRESHOLDS.temp_air_low));

  if (pm25!==null && pm25>THRESHOLDS.pm25 && Notification.permission==='granted'){
    new Notification('경고: PM2.5 초과', { body: `현재 PM2.5: ${pm25.toFixed(1)} µg/m³` });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  initCharts();
  const downloadBtn = document.getElementById('downloadCsv');
  if (downloadBtn) downloadBtn.addEventListener('click', ()=>{ if(window._lastFeeds) downloadCSV(feedsToCSV(window._lastFeeds)); else alert('저장할 데이터가 없습니다'); });
  const notifyBtn = document.getElementById('notifyBtn'); if (notifyBtn) notifyBtn.addEventListener('click', requestNotificationPermission);
  const unitToggle = document.getElementById('unitToggle'); if (unitToggle) unitToggle.addEventListener('change', (e)=>{ showFahrenheit = e.target.checked; fetchSensorData(); });
  const darkToggle = document.getElementById('darkModeToggle'); if (darkToggle) darkToggle.addEventListener('change', (e)=>{ document.documentElement.classList.toggle('dark', e.target.checked); });
  fetchSensorData();
  setInterval(fetchSensorData, 1000*60);
});

