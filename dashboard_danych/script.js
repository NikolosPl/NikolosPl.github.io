Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
Chart.defaults.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();


const ThemeManager = {
  current: localStorage.getItem('theme') || 'dark',
  init() {
    document.documentElement.setAttribute('data-theme', this.current);
    this.updateToggle();
  },
  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.current);
    localStorage.setItem('theme', this.current);
    this.updateToggle();
    App.refresh();
  },
  updateToggle() {
    document.getElementById('themeToggle').textContent = this.current === 'dark' ? '☀️' : '🌙';
  }
};
document.getElementById('themeToggle').onclick = () => ThemeManager.toggle();
ThemeManager.init();


const Skeleton = {
  statCard(h = 80) {
    return `
      <div class="skeleton skeleton-text short" style="width:50%;margin-bottom:10px"></div>
      <div class="skeleton skeleton-value"></div>
      <div class="skeleton skeleton-badge"></div>
      <div class="skeleton skeleton-chart" style="height:${h}px;margin-top:12px"></div>
    `;
  },
  chartCard(h = 240) {
    return `
      <div class="card-header">
        <div>
          <div class="skeleton skeleton-text medium" style="height:14px;width:150px"></div>
          <div class="skeleton skeleton-text short" style="height:10px;width:90px;margin-top:6px"></div>
        </div>
      </div>
      <div class="skeleton skeleton-chart" style="height:${h}px"></div>
    `;
  },
  tableRow() {
    return Array(8).fill(0).map(() => `
      <tr>
        <td><div class="skeleton" style="height:12px;width:20px"></div></td>
        <td><div style="display:flex;gap:8px;align-items:center">
          <div class="skeleton" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></div>
          <div class="skeleton skeleton-text medium" style="height:12px;width:90px"></div>
        </div></td>
        <td><div class="skeleton skeleton-text" style="height:12px;width:70px"></div></td>
        <td><div class="skeleton skeleton-text" style="height:12px;width:50px"></div></td>
        <td><div class="skeleton skeleton-text" style="height:12px;width:80px"></div></td>
      </tr>
    `).join('');
  }
};


const Cache = {
  _store: {},
  set(key, data, ttl = 60000) {
    this._store[key] = { data, expires: Date.now() + ttl };
  },
  get(key) {
    const e = this._store[key];
    if (!e || Date.now() > e.expires) return null;
    return e.data;
  },
  bust(key) { delete this._store[key]; }
};


const API = {
  async fetchCrypto() {
    const cached = Cache.get('crypto');
    if (cached) return cached;

    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    Cache.set('crypto', data, 90000);
    return data;
  },

  async fetchWeather(lat = 52.2297, lon = 21.0122, city = 'Warszawa') {
    const cached = Cache.get('weather_' + city);
    if (cached) return cached;


    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m,apparent_temperature&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Open-Meteo error');
    const data = await res.json();
    data._city = city;
    Cache.set('weather_' + city, data, 300000);
    return data;
  }
};


const Charts = {
  _instances: {},
  destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },
  destroyAll() {
    Object.keys(this._instances).forEach(id => this.destroy(id));
  },
  create(id, config) {
    this.destroy(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    this._instances[id] = new Chart(ctx, config);
    return this._instances[id];
  }
};


function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}


function weatherInfo(code) {
  const map = {
    0: {icon:'☀️', desc:'Bezchmurnie'},
    1: {icon:'🌤', desc:'Prawie bezchmurnie'},
    2: {icon:'⛅', desc:'Częściowe zachmurzenie'},
    3: {icon:'☁️', desc:'Pochmurno'},
    45: {icon:'🌫', desc:'Mgła'},
    48: {icon:'🌫', desc:'Szadź'},
    51: {icon:'🌦', desc:'Mżawka'},
    61: {icon:'🌧', desc:'Deszcz'},
    71: {icon:'🌨', desc:'Śnieg'},
    80: {icon:'🌦', desc:'Przelotny deszcz'},
    95: {icon:'⛈', desc:'Burza'},
  };
  return map[code] || {icon:'🌡', desc:'Nieznane'};
}


const Routes = {

  /* --- CRYPTO --- */
  async crypto() {
    const container = document.getElementById('mainContent');

    // Skeleton
    container.innerHTML = `
      <div class="alert-bar">
        <span class="alert-icon">ℹ️</span>
        Dane z <strong>CoinGecko API</strong>. Limit zapytań: ~30/min bez klucza.
        <a href="https://www.coingecko.com" target="_blank">coingecko.com →</a>
      </div>
      <div class="filter-bar">
        <span class="filter-label">Filtruj:</span>
        <div class="filter-pills">
          ${['Wszystkie','Top 5','Zysk','Strata'].map(f => `
            <button class="filter-pill ${f==='Wszystkie'?'active':''}" onclick="CryptoView.setFilter('${f}',this)">${f}</button>
          `).join('')}
        </div>
        <input class="filter-search" placeholder="🔍 Szukaj kryptowaluty..." oninput="CryptoView.search(this.value)" />
      </div>
      <div class="bento-grid" id="statsRow">
        ${[0,1,2,3].map(() => `<div class="bento-card span-3">${Skeleton.statCard(50)}</div>`).join('')}
      </div>
      <div class="bento-grid" style="margin-top:16px" id="chartsRow">
        <div class="bento-card span-8">${Skeleton.chartCard(280)}</div>
        <div class="bento-card span-4">${Skeleton.chartCard(280)}</div>
        <div class="bento-card span-12">
          <div class="card-header"><div><div class="card-title">🏆 Top Kryptowaluty</div></div></div>
          <table class="data-table" id="cryptoTable">
            <thead><tr><th>#</th><th>Nazwa</th><th>Cena</th><th>24h</th><th>Vol. relat.</th></tr></thead>
            <tbody>${Skeleton.tableRow()}</tbody>
          </table>
        </div>
      </div>
    `;

    let coins;
    try {
      coins = await API.fetchCrypto();
    } catch (e) {
      container.innerHTML += `<div class="alert-bar" style="border-color:rgba(252,129,129,.3);background:rgba(252,129,129,.07)">
        ⚠️ Błąd API: ${e.message}. Sprawdź połączenie lub spróbuj później.
      </div>`;
      return;
    }

    CryptoView._allCoins = coins;
    CryptoView._filter = 'Wszystkie';
    CryptoView.render(coins);
  },


  async weather() {
    const container = document.getElementById('mainContent');
    container.innerHTML = `
      <div class="filter-bar">
        <span class="filter-label">Miasto:</span>
        <div class="filter-pills">
          ${[
            {name: 'Poznań',  lat:52.40, lon:16.93},
            {name:'Warszawa', lat:52.23, lon:21.01},
            {name:'Kraków',   lat:50.06, lon:19.94},
            {name:'Gdańsk',   lat:54.35, lon:18.65},
            {name:'Wrocław',  lat:51.11, lon:17.04},
            {name:'Zakrzewo', lat:51.52, lon:17.75}
          ].map((c,i) => `
            <button class="filter-pill ${i===0?'active':''}"
              onclick="WeatherView.load('${c.name}',${c.lat},${c.lon},this)">${c.name}</button>
          `).join('')}
        </div>
      </div>
      <div class="bento-grid" id="weatherGrid">
        <div class="bento-card span-4">${Skeleton.statCard(200)}</div>
        <div class="bento-card span-8">${Skeleton.chartCard(240)}</div>
        <div class="bento-card span-12">${Skeleton.chartCard(160)}</div>
      </div>
    `;
    await WeatherView.load('Poznań', 52.40, 16.93);
  },


  async analytics() {
    const container = document.getElementById('mainContent');
    container.innerHTML = `
      <div class="bento-grid" id="analyticsGrid">
        ${[0,1,2].map(() => `<div class="bento-card span-4">${Skeleton.statCard(50)}</div>`).join('')}
        <div class="bento-card span-6">${Skeleton.chartCard(260)}</div>
        <div class="bento-card span-6">${Skeleton.chartCard(260)}</div>
        <div class="bento-card span-12">${Skeleton.chartCard(200)}</div>
      </div>
    `;
    setTimeout(() => AnalyticsView.render(), 300);
  },


  async compare() {
    const container = document.getElementById('mainContent');
    container.innerHTML = `
      <div class="alert-bar">
        ℹ️ Porównaj dane kryptowalut z poprzedniego ładowania. Wymaga wcześniejszego załadowania zakładki <strong>Kryptowaluty</strong>.
      </div>
      <div class="bento-grid">
        <div class="bento-card span-12" id="compareCard">
          ${Skeleton.chartCard(340)}
        </div>
      </div>
    `;
    setTimeout(() => CompareView.render(), 400);
  }
};


const CryptoView = {
  _allCoins: [],
  _filter: 'Wszystkie',
  _query: '',

  setFilter(name, el) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    this._filter = name;
    this.applyFilter();
  },
  search(q) {
    this._query = q.toLowerCase();
    this.applyFilter();
  },
  applyFilter() {
    let coins = this._allCoins;
    if (this._filter === 'Top 5') coins = coins.slice(0, 5);
    if (this._filter === 'Zysk') coins = coins.filter(c => c.price_change_percentage_24h > 0);
    if (this._filter === 'Strata') coins = coins.filter(c => c.price_change_percentage_24h < 0);
    if (this._query) coins = coins.filter(c => c.name.toLowerCase().includes(this._query) || c.symbol.toLowerCase().includes(this._query));
    this.render(coins);
  },

  render(coins) {
    if (!coins || !coins.length) {
      document.getElementById('statsRow').innerHTML = `<div class="bento-card span-12"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Brak wyników dla podanych filtrów</div></div></div>`;
      document.getElementById('chartsRow').innerHTML = '';
      return;
    }

    const top = coins.slice(0, 4);
    const fmt = (n) => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n.toFixed(0);
    const usd = (n) => n >= 1 ? '$'+n.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : '$'+n.toFixed(6);


    document.getElementById('statsRow').innerHTML = top.map(c => {
      const chg = c.price_change_percentage_24h;
      const spark = (c.sparkline_in_7d?.price || []).filter((_,i,a)=>i>=a.length-24);
      return `
        <div class="bento-card span-3 fade-in">
          <div class="stat-label">${c.symbol.toUpperCase()}</div>
          <div class="stat-value">${usd(c.current_price)}</div>
          <div class="stat-change ${chg>=0?'up':'down'}">${chg>=0?'↑':'↓'} ${Math.abs(chg).toFixed(2)}%</div>
          <div class="mini-chart-container"><canvas id="mini_${c.id}"></canvas></div>
        </div>
      `;
    }).join('');


    top.forEach(c => {
      const spark = (c.sparkline_in_7d?.price || []).filter((_,i,a)=>i>=a.length-24);
      const chg = c.price_change_percentage_24h;
      Charts.create(`mini_${c.id}`, {
        type: 'line',
        data: { labels: spark.map(()=>''), datasets: [{
          data: spark, borderWidth: 1.5,
          borderColor: chg >= 0 ? cssVar('--accent-3') : cssVar('--accent-4'),
          tension: 0.4, pointRadius: 0, fill: true,
          backgroundColor: chg >= 0 ? 'rgba(104,211,145,0.08)' : 'rgba(252,129,129,0.08)'
        }]},
        options: { animation: false, responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display:false }, tooltip: { enabled:false } },
          scales: { x:{display:false}, y:{display:false} }
        }
      });
    });


    const top6 = coins.slice(0, 6);
    const labels7d = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-6+i);
      return d.toLocaleDateString('pl-PL',{weekday:'short'});
    });

    document.getElementById('chartsRow').innerHTML = `
      <div class="bento-card span-8 fade-in">
        <div class="card-header">
          <div>
            <div class="card-title">📈 Zmiana ceny (7 dni)</div>
            <div class="card-subtitle">Sparkline — Top 6 kryptowalut</div>
          </div>
        </div>
        <div class="chart-container" style="height:280px">
          <canvas id="priceChart"></canvas>
        </div>
      </div>
      <div class="bento-card span-4 fade-in">
        <div class="card-header">
          <div>
            <div class="card-title">🥧 Market Cap</div>
            <div class="card-subtitle">Udział w rynku (top 6)</div>
          </div>
        </div>
        <div class="chart-container" style="height:280px">
          <canvas id="mcapChart"></canvas>
        </div>
      </div>
      <div class="bento-card span-12 fade-in">
        <div class="card-header">
          <div class="card-title">🏆 Top Kryptowaluty</div>
          <div class="card-actions">
            <div class="card-action" title="Sortuj">⇅</div>
          </div>
        </div>
        <table class="data-table" id="cryptoTable">
          <thead><tr><th>#</th><th>Nazwa</th><th>Cena (USD)</th><th>24h %</th><th>Wol. wzgl.</th></tr></thead>
          <tbody>
            ${coins.map((c,i) => {
              const chg24 = c.price_change_percentage_24h;
              const maxVol = Math.max(...coins.map(x=>x.total_volume));
              const volPct = (c.total_volume / maxVol * 100).toFixed(1);
              const colors = ['#f6ad55','#63b3ed','#68d391','#fc8181','#b794f4','#76e4f7','#fbb6ce'];
              return `
              <tr>
                <td><span class="rank-badge">${c.market_cap_rank}</span></td>
                <td>
                  <div class="coin-name">
                    <div class="coin-icon" style="background:${colors[i%colors.length]}22;color:${colors[i%colors.length]}">
                      ${c.symbol.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style="font-weight:700;font-size:13px">${c.name}</div>
                      <div class="coin-symbol">${c.symbol.toUpperCase()}</div>
                    </div>
                  </div>
                </td>
                <td class="price-cell">${usd(c.current_price)}</td>
                <td class="change-cell ${chg24>=0?'pos':'neg'}">${chg24>=0?'▲':'▼'} ${Math.abs(chg24).toFixed(2)}%</td>
                <td>
                  <div class="vol-bar-wrap">
                    <div class="vol-bar" style="width:${volPct}%;min-width:4px;max-width:100px"></div>
                    <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${volPct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const colors6 = ['#63b3ed','#f6ad55','#68d391','#fc8181','#b794f4','#76e4f7'];

    Charts.create('priceChart', {
      type: 'line',
      data: {
        labels: labels7d,
        datasets: top6.map((c,i) => {
          const sp = c.sparkline_in_7d?.price || [];
          const step = Math.floor(sp.length / 7);
          const weekly = [0,1,2,3,4,5,6].map(d => sp[d*step] || sp[sp.length-1] || 0);
          return {
            label: c.symbol.toUpperCase(),
            data: weekly,
            borderColor: colors6[i],
            backgroundColor: colors6[i]+'18',
            borderWidth: 2, pointRadius: 3,
            pointBackgroundColor: colors6[i],
            tension: 0.4, fill: false
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position:'bottom', labels:{boxWidth:10, padding:16, font:{size:11}} } },
        scales: {
          x: { grid:{color:cssVar('--border')}, ticks:{color:cssVar('--text-muted'),font:{size:10}} },
          y: { grid:{color:cssVar('--border')}, ticks:{color:cssVar('--text-muted'),font:{size:10},callback:v=>'$'+v.toLocaleString()} }
        }
      }
    });

    Charts.create('mcapChart', {
      type: 'doughnut',
      data: {
        labels: top6.map(c=>c.symbol.toUpperCase()),
        datasets: [{
          data: top6.map(c=>c.market_cap),
          backgroundColor: colors6,
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend:{position:'bottom',labels:{boxWidth:10,padding:12,font:{size:11}}},
          tooltip:{callbacks:{label:ctx=>' '+ctx.label+': $'+fmt(ctx.raw)}}
        }
      }
    });
  }
};


const WeatherView = {
  async load(city, lat, lon, btn) {
    if (btn) {
      document.querySelectorAll('.filter-pill').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
    }

    Charts.destroy('tempChart');
    Charts.destroy('windChart');

    document.getElementById('weatherGrid').innerHTML = `
      <div class="bento-card span-4">${Skeleton.statCard(220)}</div>
      <div class="bento-card span-8">${Skeleton.chartCard(260)}</div>
      <div class="bento-card span-12">${Skeleton.chartCard(140)}</div>
    `;

    let data;
    try {
      data = await API.fetchWeather(lat, lon, city);
    } catch(e) {
      document.getElementById('weatherGrid').innerHTML = `
        <div class="bento-card span-12">
          <div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Błąd pobierania danych: ${e.message}</div></div>
        </div>`;
      return;
    }

    const cur = data.current;
    const daily = data.daily;
    const wi = weatherInfo(cur.weathercode);
    const days = ['Nd','Pn','Wt','Śr','Cz','Pt','So'];
    const dayLabels = daily.time.map(t => {
      const d = new Date(t); return days[d.getDay()];
    });

    document.getElementById('weatherGrid').innerHTML = `
      <div class="bento-card span-4 fade-in">
        <div class="card-title" style="margin-bottom:20px">🌍 ${city}</div>
        <div class="weather-hero">
          <div>
            <div class="weather-temp">${Math.round(cur.temperature_2m)}°</div>
            <div class="weather-desc">${wi.desc}</div>
            <div class="weather-city">Odczuwalna: ${Math.round(cur.apparent_temperature)}°C</div>
          </div>
          <div class="weather-icon-big">${wi.icon}</div>
        </div>
        <div class="weather-stats">
          <div class="weather-stat-item">
            <div class="weather-stat-val">${cur.windspeed_10m}<span style="font-size:12px">km/h</span></div>
            <div class="weather-stat-lbl">💨 Wiatr</div>
          </div>
          <div class="weather-stat-item">
            <div class="weather-stat-val">${cur.relative_humidity_2m}<span style="font-size:12px">%</span></div>
            <div class="weather-stat-lbl">💧 Wilgotn.</div>
          </div>
          <div class="weather-stat-item">
            <div class="weather-stat-val">${Math.round(daily.temperature_2m_max[0])}°</div>
            <div class="weather-stat-lbl">🔆 Max</div>
          </div>
        </div>
        <div class="forecast-list">
          ${daily.time.slice(1,8).map((_,i) => {
            const fi = weatherInfo(daily.weathercode[i+1]);
            return `
              <div class="forecast-item">
                <div class="forecast-day">${dayLabels[i+1]}</div>
                <div class="forecast-icon">${fi.icon}</div>
                <div class="forecast-temp">${Math.round(daily.temperature_2m_max[i+1])}°</div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div class="bento-card span-8 fade-in">
        <div class="card-header"><div>
          <div class="card-title">🌡 Temperatura 7 dni</div>
          <div class="card-subtitle">Min / Max dobowy</div>
        </div></div>
        <div class="chart-container" style="height:260px"><canvas id="tempChart"></canvas></div>
      </div>
      <div class="bento-card span-12 fade-in">
        <div class="card-header"><div>
          <div class="card-title">💨 Prognoza wiatru (7 dni, szacunek)</div>
        </div></div>
        <div class="chart-container" style="height:140px"><canvas id="windChart"></canvas></div>
      </div>
    `;

    Charts.create('tempChart', {
      type: 'line',
      data: {
        labels: dayLabels,
        datasets: [
          { label:'Max °C', data: daily.temperature_2m_max, borderColor: cssVar('--accent-2'),
            backgroundColor:'rgba(246,173,85,0.12)', fill:true, tension:0.4, borderWidth:2, pointRadius:4 },
          { label:'Min °C', data: daily.temperature_2m_min, borderColor: cssVar('--accent'),
            backgroundColor:'rgba(99,179,237,0.08)', fill:true, tension:0.4, borderWidth:2, pointRadius:4 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14,font:{size:11}}}},
        scales:{
          x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:11}}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:11},callback:v=>v+'°C'}}
        }
      }
    });


    const windEst = daily.temperature_2m_max.map(()=> Math.round(cur.windspeed_10m * (0.7 + Math.random()*0.6)));
    Charts.create('windChart', {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          label:'Wiatr km/h',
          data: windEst,
          backgroundColor: cssVar('--accent-3')+'55',
          borderColor: cssVar('--accent-3'),
          borderWidth: 1, borderRadius: 4
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:11}}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:11},callback:v=>v+' km/h'}}
        }
      }
    });
  }
};


const AnalyticsView = {
  render() {
    const months = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
    const revenue = [42,58,53,71,68,84,92,79,95,103,115,128].map(v=>v*1000 + Math.random()*5000|0);
    const users = [1200,1450,1380,1720,1690,2100,2350,2010,2480,2760,3100,3450];
    const sessions = users.map(u => u * (2.1 + Math.random()*0.5));

    document.getElementById('analyticsGrid').innerHTML = `
      <div class="bento-card span-4 fade-in">
        <div class="stat-label">📈 Przychód YTD</div>
        <div class="stat-value">$${(revenue.reduce((a,b)=>a+b,0)/1000).toFixed(0)}k</div>
        <div class="stat-change up">↑ 24.3% vs rok poprz.</div>
      </div>
      <div class="bento-card span-4 fade-in">
        <div class="stat-label">👥 Aktywni użytkownicy</div>
        <div class="stat-value">${users[users.length-1].toLocaleString()}</div>
        <div class="stat-change up">↑ 11.3% MoM</div>
      </div>
      <div class="bento-card span-4 fade-in">
        <div class="stat-label">🔁 Sesje / użytk.</div>
        <div class="stat-value">${(sessions[sessions.length-1]/users[users.length-1]).toFixed(1)}</div>
        <div class="stat-change down">↓ 2.1% MoM</div>
      </div>
      <div class="bento-card span-6 fade-in">
        <div class="card-header"><div>
          <div class="card-title">💰 Przychód miesięczny</div>
          <div class="card-subtitle">Dane generowane — 12 miesięcy</div>
        </div></div>
        <div class="chart-container" style="height:260px"><canvas id="revenueChart"></canvas></div>
      </div>
      <div class="bento-card span-6 fade-in">
        <div class="card-header"><div>
          <div class="card-title">👥 Wzrost użytkowników</div>
          <div class="card-subtitle">MAU — miesięczni aktywni</div>
        </div></div>
        <div class="chart-container" style="height:260px"><canvas id="userChart"></canvas></div>
      </div>
      <div class="bento-card span-12 fade-in">
        <div class="card-header"><div>
          <div class="card-title">📊 Sesje vs Użytkownicy</div>
        </div></div>
        <div class="chart-container" style="height:200px"><canvas id="sessionChart"></canvas></div>
      </div>
    `;

    Charts.create('revenueChart', {
      type:'bar', data:{
        labels:months,
        datasets:[{label:'Przychód ($)', data:revenue,
          backgroundColor: months.map((_,i)=> i===months.length-1 ? cssVar('--accent') : cssVar('--accent')+'44'),
          borderRadius:6, borderSkipped:false}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10}}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10},callback:v=>'$'+(v/1000).toFixed(0)+'k'}}}}
    });

    Charts.create('userChart', {
      type:'line', data:{
        labels:months,
        datasets:[{label:'MAU', data:users, borderColor:cssVar('--accent-2'),
          backgroundColor:'rgba(246,173,85,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:3}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10}}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10}}}}}
    });

    Charts.create('sessionChart', {
      type:'line', data:{
        labels:months,
        datasets:[
          {label:'Sesje', data:sessions.map(s=>s|0), borderColor:cssVar('--accent-3'), tension:0.4, borderWidth:2, pointRadius:2, fill:false},
          {label:'Użytkownicy', data:users, borderColor:cssVar('--accent-4'), tension:0.4, borderWidth:2, pointRadius:2, fill:false}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14,font:{size:11}}}},
        scales:{x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10}}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),font:{size:10}}}}}
    });
  }
};


const CompareView = {
  render() {
    const coins = CryptoView._allCoins;
    if (!coins || coins.length < 2) {
      document.getElementById('compareCard').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚖️</div>
          <div class="empty-text">Najpierw załaduj dane z zakładki <strong>Kryptowaluty</strong></div>
        </div>`;
      return;
    }

    const top5 = coins.slice(0, 5);
    const metrics = ['price_change_percentage_1h_in_currency','price_change_percentage_24h','price_change_percentage_7d_in_currency'];
    const metricLabels = ['1h %','24h %','7d %'];
    const colors = ['#63b3ed','#f6ad55','#68d391','#fc8181','#b794f4'];

    document.getElementById('compareCard').innerHTML = `
      <div class="card-header"><div>
        <div class="card-title">⚖️ Porównanie zmian procentowych</div>
        <div class="card-subtitle">Top 5 — 1h / 24h / 7d</div>
      </div></div>
      <div class="chart-container" style="height:340px"><canvas id="compareChart"></canvas></div>
    `;

    Charts.create('compareChart', {
      type:'bar',
      data:{
        labels: metricLabels,
        datasets: top5.map((c,i)=>({
          label: c.symbol.toUpperCase(),
          data: metrics.map(m => +(c[m]||0).toFixed(2)),
          backgroundColor: colors[i]+'88',
          borderColor: colors[i],
          borderWidth:1, borderRadius:4
        }))
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14,font:{size:11}}}},
        scales:{
          x:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted')}},
          y:{grid:{color:cssVar('--border')},ticks:{color:cssVar('--text-muted'),callback:v=>v+'%'}}
        }
      }
    });
  }
};


const pageMeta = {
  crypto:    { title: '₿ Kryptowaluty',  icon: '₿' },
  weather:   { title: '🌡 Pogoda',        icon: '🌡' },
  analytics: { title: '📊 Analytics',     icon: '📊' },
  compare:   { title: '⚖ Porównanie',    icon: '⚖' },
};

function navigate(route) {
  window.location.hash = '/' + route;
}

function handleRoute() {
  Charts.destroyAll();
  const hash = window.location.hash.replace('#/','') || 'crypto';
  const route = hash in Routes ? hash : 'crypto';


  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.route === route);
  });


  const meta = pageMeta[route] || pageMeta.crypto;
  document.getElementById('pageTitle').innerHTML = `<span class="page-title-icon">${meta.icon}</span> ${meta.title.replace(/^\S+\s/,'')}`;

  document.getElementById('mainContent').classList.remove('page-enter');
  void document.getElementById('mainContent').offsetWidth;
  document.getElementById('mainContent').classList.add('page-enter');

  Routes[route]();
}

window.addEventListener('hashchange', handleRoute);


const App = {
  _timer: null,
  init() {
    this.updateClock();
    this._timer = setInterval(() => this.updateClock(), 1000);
    handleRoute();
  },
  updateClock() {
    const el = document.getElementById('lastUpdateText');
    if (el) el.textContent = new Date().toLocaleTimeString('pl-PL');
  },
  refresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    // Bust cache for current route
    const route = window.location.hash.replace('#/','') || 'crypto';
    if (route === 'crypto') Cache.bust('crypto');
    if (route === 'weather') {/* bust all weather keys */
      Object.keys(Cache._store).filter(k=>k.startsWith('weather_')).forEach(k=>Cache.bust(k));
    }
    handleRoute();
    setTimeout(() => btn.classList.remove('spinning'), 800);
  }
};

App.init();
