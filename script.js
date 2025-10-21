const CHANNEL_ID = '3029174';
const READ_API_KEY = 'JHYIGI9QFA6EQG1F';
const THINGSPEAK_FEED_URL =
  `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds.json?api_key=${READ_API_KEY}&results=20`;

async function fetchSensorData() {
  try {
    const response = await fetch(THINGSPEAK_FEED_URL);
    const data = await response.json();

    const feeds = data.feeds;

    if (!feeds || feeds.length === 0) {
      console.warn("ThingSpeak: 가져온 데이터가 없습니다.");
      return;
    }

    // ThingSpeak field mapping (사용자 요청에 따라)
    // field1: temperature_air
    // field2: humidity_air
    // field3: pressure_air
    // field4: pm2.5
    // field5: pm10
    // field6: temperature_water

    let sums = { temp_air: 0, hum_air: 0, pres_air: 0, pm25: 0, pm10: 0, temp_water: 0 };
    let counts = { temp_air: 0, hum_air: 0, pres_air: 0, pm25: 0, pm10: 0, temp_water: 0 };

    feeds.forEach(feed => {
      const tAir = parseFloat(feed.field1);
      const hAir = parseFloat(feed.field2);
      const pAir = parseFloat(feed.field3);
      const pm2_5 = parseFloat(feed.field4);
      const pm10 = parseFloat(feed.field5);
      const tWater = parseFloat(feed.field6);

      if (!isNaN(tAir)) { sums.temp_air += tAir; counts.temp_air++; }
      if (!isNaN(hAir)) { sums.hum_air += hAir; counts.hum_air++; }
      if (!isNaN(pAir)) { sums.pres_air += pAir; counts.pres_air++; }
      if (!isNaN(pm2_5)) { sums.pm25 += pm2_5; counts.pm25++; }
      if (!isNaN(pm10)) { sums.pm10 += pm10; counts.pm10++; }
      if (!isNaN(tWater)) { sums.temp_water += tWater; counts.temp_water++; }
    });

    // 안전하게 평균 계산 (데이터 없을 때는 -- 표시)
    const avg = key => counts[key] ? (sums[key] / counts[key]) : null;

    const avgTemp = avg('temp_air');
    const avgHum = avg('hum_air');
    const avgPres = avg('pres_air');
    const avgPm25 = avg('pm25');
    const avgPm10 = avg('pm10');
    const avgTempWater = avg('temp_water');

    document.getElementById('temperature').textContent = avgTemp !== null ? `${avgTemp.toFixed(1)}℃` : '--℃';
    document.getElementById('humidity').textContent = avgHum !== null ? `${avgHum.toFixed(1)}%` : '--%';
    document.getElementById('pressure').textContent = avgPres !== null ? `${avgPres.toFixed(1)} hPa` : '---- hPa';

    // 선택적 필드가 존재하면 DOM에 표시 (없으면 console에 로그)
    const pm25El = document.getElementById('pm25');
    const pm10El = document.getElementById('pm10');
    const tempWaterEl = document.getElementById('temperature_water');

    if (pm25El) pm25El.textContent = avgPm25 !== null ? `${avgPm25.toFixed(1)} µg/m³` : '-- µg/m³';
    else if (avgPm25 !== null) console.log('PM2.5 average:', avgPm25.toFixed(1));

    if (pm10El) pm10El.textContent = avgPm10 !== null ? `${avgPm10.toFixed(1)} µg/m³` : '-- µg/m³';
    else if (avgPm10 !== null) console.log('PM10 average:', avgPm10.toFixed(1));

    if (tempWaterEl) tempWaterEl.textContent = avgTempWater !== null ? `${avgTempWater.toFixed(1)}℃` : '--℃';
    else if (avgTempWater !== null) console.log('Water temperature average:', avgTempWater.toFixed(1));

  } catch (error) {
    console.error("ThingSpeak 데이터 불러오기 오류:", error);
  }
}

fetchSensorData();
setInterval(fetchSensorData, 1000 * 60); 
