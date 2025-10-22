// script.js
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
let pm10Data = [];

function initCharts() {
  const tCanvas = document.getElementById('tempChart');
  const pCanvas = document.getElementById('pmChart');
  if (!tCanvas || !pCanvas) return;

  const tCtx = tCanvas.getContext('2d');
  const pCtx = pCanvas.getContext('2d');

  // 온도 차트: x축 타입을 'time'으로 설정하여 시간 표시를 자동으로 처리
  tempChart = new Chart(tCtx, {
    type: 'line',
    data: { 
      labels: [], // 'time' 축을 사용할 때는 비워두는 것이 좋음
      datasets: [{ label: '온도 (℃)', data: [], borderColor: '#ff6384', tension: 0.3, fill: false }] 
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'time', // <-- 수정: x축 타입을 time으로 변경
          time: {      // <-- 수정: time 설정 추가
            unit: 'hour', // 데이터 간격에 따라 유닛을 자동으로 조절
            tooltipFormat: 'MM/dd HH:mm', // 툴팁 표시 포맷
            displayFormats: {
              hour: 'HH:mm', // 시간 단위 레이블 포맷
              day: 'MM/dd',
            }
          },
          // 기존의 ticks.callback은 time 설정으로 대체
        }
      }
    }
  });

  // 미세먼지 차트: x축 타입을 'time'으로 설정하여 시간 표시를 자동으로 처리
  pmChart = new Chart(pCtx, {
    type: 'line',
    data: { 
      labels: [], // 'time' 축을 사용할 때는 비워두는 것이 좋음
      datasets: [
        { label: '초미세먼지 PM2.5 (µg/m³)', data: [], borderColor: '#36a2eb', tension: 0.3, fill: false },
        { label: '미세먼지 PM10 (µg/m³)', data: [], borderColor: '#9b59b6', tension: 0.3, fill: false }
      ] 
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, position: 'top' } },
      scales: {
        x: {
          type: 'time', // <-- 수정: x축 타입을 time으로 변경
          time: {      // <-- 수정: time 설정 추가
            unit: 'hour',
            tooltipFormat: 'MM/dd HH:mm',
            displayFormats: {
              hour: 'HH:mm',
              day: 'MM/dd',
            }
          },
          // 기존의 ticks.callback은 time 설정으로 대체
        }
      }
    }
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
// Notification cooldown (milliseconds) and storage key
const NOTIFY_COOLDOWN_MS = 1000 * 60 * 60; // 1 hour
const NOTIFY_STORAGE_KEY = 'thing_speak_notify_state';

function _readNotifyState(){
  try { return JSON.parse(localStorage.getItem(NOTIFY_STORAGE_KEY) || '{}'); } catch(e){ return {}; }
}
function _writeNotifyState(obj){
  try { localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(obj)); } catch(e){}
}
function canNotify(key){
  const state = _readNotifyState();
  const last = state[key];
  if (!last) return true;
  return (Date.now() - last) > NOTIFY_COOLDOWN_MS;
}
function markNotified(key){
  const state = _readNotifyState(); state[key] = Date.now(); _writeNotifyState(state);
}

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

// Get recent average of the N most recent valid values for a given field name (e.g., 'field1')
function getRecentAverage(feeds, fieldName, n = 2){
  if (!feeds || feeds.length===0) return null;
  // sort descending by created_at (newest first)
  const sorted = feeds.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  const vals = [];
  for (let i=0;i<sorted.length && vals.length < n;i++){
    const v = parseFloat(sorted[i][fieldName]);
    if (!isNaN(v)) vals.push(v);
  }
  if (vals.length===0) return null;
  const s = vals.reduce((a,b)=>a+b,0);
  return s/vals.length;
}

function processFeeds(feeds, fromCache=false){
  // Prepare arrays used for charting
  tempData = [];
  pmData = [];
  pm10Data = [];

  // Populate the time series arrays (we still iterate through feeds to collect timestamped series)
  feeds.forEach(f => {
    const t = parseFloat(f.field1);
    const h = parseFloat(f.field2);
    const p = parseFloat(f.field3);
    const pm2_5 = parseFloat(f.field4);
    const pm10 = parseFloat(f.field5);
    const tw = parseFloat(f.field6);

    // created_at을 Date 객체로 변환하여 사용
    const date = new Date(f.created_at);

    if (!isNaN(t)){ tempData.push({x:date.getTime(),y:t}); }
    if (!isNaN(pm2_5)){ pmData.push({x:date.getTime(),y:pm2_5}); }
    if (!isNaN(pm10)){ pm10Data.push({x:date.getTime(),y:pm10}); }
    // other fields (humidity, pressure, water temp) are not needed as time series for charts here
  });

  // Compute card display averages using the most recent two valid datapoints per field
  const avgTemp = getRecentAverage(feeds, 'field1', 2);
  const avgHum = getRecentAverage(feeds, 'field2', 2);
  const avgPres = getRecentAverage(feeds, 'field3', 2);
  const avgPm25 = getRecentAverage(feeds, 'field4', 2);
  const avgPm10 = getRecentAverage(feeds, 'field5', 2);
  const avgTempWater = getRecentAverage(feeds, 'field6', 2);

  const displayTemp = avgTemp !== null ? (showFahrenheit? cToF(avgTemp).toFixed(1)+'℉': avgTemp.toFixed(1)+'℃') : '--℃';
  document.getElementById('temperature').textContent = avgTemp!==null? displayTemp : '--℃';
  document.getElementById('humidity').textContent = avgHum!==null? avgHum.toFixed(1)+'%':'--%';
  document.getElementById('pressure').textContent = avgPres!==null? avgPres.toFixed(1)+' hPa':'---- hPa';
  document.getElementById('pm25').textContent = avgPm25!==null? avgPm25.toFixed(1)+' µg/m³':'-- µg/m³';
  document.getElementById('pm10').textContent = avgPm10!==null? avgPm10.toFixed(1)+' µg/m³':'-- µg/m³';
  document.getElementById('temperature_water').textContent = avgTempWater!==null? avgTempWater.toFixed(1)+'℃':'--℃';

  applyAlerts(avgPm25, avgPm10, avgTemp, fromCache);

  // 지난 24시간 데이터만 사용 (10분 간격이면 약 144개)
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24*60*60*1000);
  
  // 데이터 객체의 x값이 이미 타임스탬프(ms)이므로 필터링
  const recentTemp = tempData.filter(d => d.x >= dayAgo.getTime() && d.x <= now.getTime());
  const recentPm = pmData.filter(d => d.x >= dayAgo.getTime() && d.x <= now.getTime());
  const recentPm10 = pm10Data.filter(d => d.x >= dayAgo.getTime() && d.x <= now.getTime());

  if (tempChart){
    // 'time' 축을 사용하므로 labels 배열은 비워두고, datasets에 {x: ms, y: value} 형식의 데이터를 할당
    tempChart.data.labels = []; 
    tempChart.data.datasets[0].data = recentTemp.map(d=> ({x: d.x, y: d.y}));
    tempChart.update();
  }
  if (pmChart){
    // 'time' 축을 사용하므로 labels 배열은 비워두고, datasets에 {x: ms, y: value} 형식의 데이터를 할당
    pmChart.data.labels = [];
    
    // 이제 데이터셋에 직접 타임스탬프를 x값으로 가진 객체 배열을 할당
    pmChart.data.datasets[0].data = recentPm.map(d=> ({x: d.x, y: d.y}));
    pmChart.data.datasets[1].data = recentPm10.map(d=> ({x: d.x, y: d.y}));

    // time 축이 x값을 기준으로 자동으로 정렬하고 표시해줌
    pmChart.update();
  }

  // PM2.5/PM10 상태 텍스트, AQI 및 차트 색상 업데이트
  updatePMStatusAndAQI(avgPm25, avgPm10);

  window._lastFeeds = feeds;
}

// 지난 24시간 데이터를 테이블에 렌더
// day-table removed from HTML; no render function required

function applyAlerts(pm25, pm10, temp, fromCache=false){
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

  // Do not send notifications when rendering cached/offline data
  if (fromCache) return;

  // PM2.5 notification with cooldown
  if (pm25!==null && pm25>THRESHOLDS.pm25 && Notification.permission==='granted'){
    if (canNotify('pm25')){
      new Notification('경고: PM2.5 초과', { body: `현재 PM2.5: ${pm25.toFixed(1)} µg/m³` });
      markNotified('pm25');
    }
  }

  // PM10 notification with cooldown
  if (pm10!==null && pm10>THRESHOLDS.pm10 && Notification.permission==='granted'){
    if (canNotify('pm10')){
      new Notification('경고: PM10 초과', { body: `현재 PM10: ${pm10.toFixed(1)} µg/m³` });
      markNotified('pm10');
    }
  }

  // Temperature notifications (high/low) with cooldown
  if (temp!==null && Notification.permission==='granted'){
    if (temp > THRESHOLDS.temp_air_high && canNotify('temp_high')){
      new Notification('경고: 높은 기온', { body: `현재 온도: ${temp.toFixed(1)}℃` });
      markNotified('temp_high');
    }
    if (temp < THRESHOLDS.temp_air_low && canNotify('temp_low')){
      new Notification('경고: 낮은 기온', { body: `현재 온도: ${temp.toFixed(1)}℃` });
      markNotified('temp_low');
    }
  }
}

// PM2.5 심각도 판정
function pm25Category(val){
  if (val === null) return {label: '--', color: '#999'};
  // 기준 (µg/m3): <=12 매우 좋음, <=35 좋음, <=55 보통, <=150 나쁨, >150 매우 나쁨
  if (val <= 12) return {label: '매우 좋음', color: '#2ecc71'};
  if (val <= 35) return {label: '좋음', color: '#7bd389'};
  if (val <= 55) return {label: '보통', color: '#f1c40f'};
  if (val <= 150) return {label: '나쁨', color: '#e67e22'};
  return {label: '매우 나쁨', color: '#c0392b'};
}

// AQI 계산 (미국 EPA 기준 간단 구현)
const AQI_BREAKPOINTS = {
  pm25: [
    {Clow:0.0, Chigh:12.0, Ilow:0, Ihigh:50},
    {Clow:12.1, Chigh:35.4, Ilow:51, Ihigh:100},
    {Clow:35.5, Chigh:55.4, Ilow:101, Ihigh:150},
    {Clow:55.5, Chigh:150.4, Ilow:151, Ihigh:200},
    {Clow:150.5, Chigh:250.4, Ilow:201, Ihigh:300},
    {Clow:250.5, Chigh:350.4, Ilow:301, Ihigh:400},
    {Clow:350.5, Chigh:500.4, Ilow:401, Ihigh:500}
  ],
  pm10: [
    {Clow:0, Chigh:54, Ilow:0, Ihigh:50},
    {Clow:55, Chigh:154, Ilow:51, Ihigh:100},
    {Clow:155, Chigh:254, Ilow:101, Ihigh:150},
    {Clow:255, Chigh:354, Ilow:151, Ihigh:200},
    {Clow:355, Chigh:424, Ilow:201, Ihigh:300},
    {Clow:425, Chigh:504, Ilow:301, Ihigh:400},
    {Clow:505, Chigh:604, Ilow:401, Ihigh:500}
  ]
};

function concToAQI(conc, pollutant){
  if (conc === null || isNaN(conc)) return null;
  const bps = AQI_BREAKPOINTS[pollutant];
  for (let i=0;i<bps.length;i++){
    const bp = bps[i];
    if (conc >= bp.Clow && conc <= bp.Chigh){
      const I = Math.round((bp.Ihigh - bp.Ilow)/(bp.Chigh - bp.Clow) * (conc - bp.Clow) + bp.Ilow);
      return I;
    }
  }
  return null;
}

function aqiCategoryLabel(aqi){
  if (aqi === null) return '--';
  if (aqi <= 50) return '좋음';
  if (aqi <= 100) return '보통';
  if (aqi <= 150) return '나쁨(민감군)';
  if (aqi <= 200) return '나쁨';
  if (aqi <= 300) return '매우 나쁨';
  return '위험';
}

function updatePMStatusAndAQI(avgPm25, avgPm10){
  const statusEl = document.getElementById('pmStatus');
  const aqiEl = document.getElementById('aqiSummary');
  if (statusEl){ const cat = pm25Category(avgPm25); statusEl.textContent = `상태: ${cat.label}`; statusEl.style.color = cat.color; }
  const aqi25 = concToAQI(avgPm25, 'pm25');
  const aqi10 = concToAQI(avgPm10, 'pm10');
  const overall = [aqi25, aqi10].filter(x=>x!==null);
  const overallAQI = overall.length? Math.max(...overall) : null;
  const catLabel = aqiCategoryLabel(overallAQI);
  if (aqiEl) aqiEl.textContent = overallAQI? `AQI: ${overallAQI} (카테고리: ${catLabel})` : 'AQI: -- (카테고리: --)';
  // 차트 색 업데이트: PM2.5 색 by pm25Category, PM10 use fixed color or scaled
  if (pmChart && pmChart.data && pmChart.data.datasets){
    if (avgPm25!==null){ pmChart.data.datasets[0].borderColor = pm25Category(avgPm25).color; }
    if (avgPm10!==null){ pmChart.data.datasets[1].borderColor = '#8e44ad'; }
    pmChart.update();
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
