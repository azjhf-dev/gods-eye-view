/* God's-Eye View: Hidden History
 * Ancient and megalithic sites, geo-located. Every site sourced; documented vs disputed is labelled.
 * Adapted from God's-Eye View: The AI Trade (itself a fork adaptation of bilawalsidhu/gods-eye-view).
 * Data lives in data/signals.json (canonical) and data/signals.js (file:// fallback).
 */
(function () {
  'use strict';

  var CATEGORIES = {
    'megalith':    { color: '#ffd166', label: 'Megalith / quarry' },
    'temple':      { color: '#ef476f', label: 'Megalithic temple' },
    'pyramid':     { color: '#06d6a0', label: 'Pyramid' },
    'circle':      { color: '#118ab2', label: 'Stone circle / alignment' },
    'underground': { color: '#9b5de5', label: 'Underground / rock-cut' },
    'submerged':   { color: '#ff9f1c', label: 'Submerged / anomalous' }
  };
  var FACT_COLOR = '#06d6a0';
  var INFERENCE_COLOR = '#ffd166';

  function fatal(msg) {
    var el = document.getElementById('fatal');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function loadData() {
    if (window.SIGNALS_DATA) return Promise.resolve(window.SIGNALS_DATA);
    return fetch('data/signals.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // node radius scales with largest-stone tonnage when we have it
  function amountRadius(d) {
    if (!d.tonnage) return 0.45;
    var v = (Math.log10(d.tonnage) - 0.5) * 0.5;
    return Math.min(1.6, Math.max(0.45, v));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  loadData().then(function (data) {
    if (typeof Globe !== 'function') {
      fatal('globe.gl failed to load.\nThis app pulls globe.gl from unpkg.com - check your connection,\nor serve the repo locally:  python3 -m http.server');
      return;
    }
    boot(data);
  }).catch(function (e) {
    fatal('Could not load data/signals.json (' + e.message + ').\n\nIf you opened index.html directly, run a one-line static server instead:\n\n  python3 -m http.server 8000\n\nthen open http://localhost:8000');
  });

  function boot(data) {
    var nodes = data.nodes || [];
    var arcs = data.arcs || [];
    var insights = data.insights || [];
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    document.getElementById('data-date').textContent =
      'sites as of ' + (data.meta && data.meta.generated_at || 'unknown') +
      ' · ' + nodes.length + ' sites · ' + arcs.length + ' links';
    document.getElementById('disclaimer').textContent =
      (data.meta && data.meta.disclaimer) || '';

    // --- state -------------------------------------------------------------
    var activeCategories = {};
    Object.keys(CATEGORIES).forEach(function (k) { activeCategories[k] = true; });
    var showFact = true, showInference = true;

    function nodeVisible(n) {
      if (!activeCategories[n.category]) return false;
      if (n.status === 'fact' && !showFact) return false;
      if (n.status === 'inference' && !showInference) return false;
      return true;
    }
    function arcVisible(a) {
      var f = byId[a.from], t = byId[a.to];
      if (!f || !t) return false;
      if (a.status === 'fact' && !showFact) return false;
      if (a.status === 'inference' && !showInference) return false;
      return nodeVisible(f) && nodeVisible(t);
    }

    // --- globe -------------------------------------------------------------
    var globe = Globe()
      .globeImageUrl('assets/earth-blue-marble.jpg')
      .bumpImageUrl('assets/earth-topology.png')
      .backgroundColor('rgba(5,7,13,1)')
      .atmosphereColor('#3a5f9e')
      .atmosphereAltitude(0.18)
      // points
      .pointLat('lat').pointLng('lng')
      .pointColor(function (d) { return (CATEGORIES[d.category] || {}).color || '#fff'; })
      .pointAltitude(function (d) { return d.category === 'megalith' ? 0.06 : 0.02; })
      .pointRadius(amountRadius)
      .pointLabel(function (d) {
        return '<div style="font:12px monospace;background:rgba(5,7,13,.85);padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,.15)">' +
          '<b>' + esc(d.name) + '</b><br/>' + esc(d.amount_label || '') +
          '<br/><span style="color:#8b96a8">' + (d.status === 'fact' ? 'DOCUMENTED' : 'DISPUTED') + ' · ' + esc(d.place || '') + '</span></div>';
      })
      .onPointClick(showDetail)
      // arcs
      .arcStartLat(function (a) { return byId[a.from].lat; })
      .arcStartLng(function (a) { return byId[a.from].lng; })
      .arcEndLat(function (a) { return byId[a.to].lat; })
      .arcEndLng(function (a) { return byId[a.to].lng; })
      .arcColor(function (a) { return a.status === 'fact' ? [FACT_COLOR, FACT_COLOR] : [INFERENCE_COLOR, INFERENCE_COLOR]; })
      .arcStroke(function (a) { return 0.6; })
      .arcDashLength(0.45).arcDashGap(0.25).arcDashAnimateTime(2600)
      .arcAltitudeAutoScale(0.35)
      .arcLabel(function (a) {
        return '<div style="font:12px monospace;background:rgba(5,7,13,.85);padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,.15)">' +
          esc(a.label) + ' · ' + (a.status === 'fact' ? 'DOCUMENTED' : 'DISPUTED') + '</div>';
      })
      // labels
      .labelLat('lat').labelLng('lng')
      .labelText(function (d) { return d.name; })
      .labelSize(function (d) { return d.category === 'megalith' ? 1.4 : 0.9; })
      .labelDotRadius(0.28)
      .labelColor(function () { return 'rgba(232,237,245,0.85)'; })
      .labelAltitude(0.09)
      .labelResolution(2)
      (document.getElementById('globe'));

    // --- camera controls: rotate + zoom, touch-first ----------------------
    var controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 115;  // globe radius is 100; stay just above ground level
    controls.maxDistance = 900;
    globe.pointOfView({ lat: 26, lng: 31, altitude: 2.4 }); // open on Egypt
    window.__globe = globe; // debug / deep-link access

    // explicit zoom affordance (mobile buttons, also handy on trackpads)
    function zoomBy(factor) {
      var pov = globe.pointOfView();
      var alt = Math.min(3.5, Math.max(0.15, pov.altitude * factor));
      controls.autoRotate = false;
      globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: alt }, 350);
    }
    document.getElementById('zoom-in').addEventListener('click', function () { zoomBy(1 / 1.5); });
    document.getElementById('zoom-out').addEventListener('click', function () { zoomBy(1.5); });

    // mobile: layers panel starts hidden behind a toggle so the globe gets the screen
    document.getElementById('panel-toggle').addEventListener('click', function () {
      document.body.classList.toggle('panel-open');
    });
    globe.onGlobeClick && globe.onGlobeClick(function () {
      document.body.classList.remove('panel-open');
    });

    // dense clusters (Egypt, Peru) stay as points + hover tooltips;
    // only structurally separated nodes get map labels
    var LABELLED_CATEGORIES = { 'megalith': 1, 'submerged': 1, 'underground': 1 };
    function labelWorthy(n) {
      return LABELLED_CATEGORIES[n.category];
    }

    function refresh() {
      globe.pointsData(nodes.filter(nodeVisible));
      globe.labelsData(nodes.filter(function (n) { return nodeVisible(n) && labelWorthy(n); }));
      globe.arcsData(arcs.filter(arcVisible));
    }
    refresh();

    // --- filters -----------------------------------------------------------
    var filtersEl = document.getElementById('filters');
    Object.keys(CATEGORIES).forEach(function (key) {
      var cat = CATEGORIES[key];
      var present = nodes.some(function (n) { return n.category === key; });
      if (!present) return;
      var label = document.createElement('label');
      label.innerHTML = '<input type="checkbox" checked data-cat="' + key + '" />' +
        '<span class="swatch" style="background:' + cat.color + '"></span>' + esc(cat.label);
      label.querySelector('input').addEventListener('change', function (ev) {
        activeCategories[key] = ev.target.checked;
        refresh();
      });
      filtersEl.appendChild(label);
    });
    document.getElementById('show-fact').addEventListener('change', function (ev) {
      showFact = ev.target.checked; refresh();
    });
    document.getElementById('show-inference').addEventListener('change', function (ev) {
      showInference = ev.target.checked; refresh();
    });

    // --- open-questions list ----------------------------------------------
    var listEl = document.getElementById('insight-list');
    insights.forEach(function (ins) {
      var div = document.createElement('div');
      div.className = 'insight';
      div.innerHTML =
        '<span class="badge ' + esc(ins.status) + '">' + (ins.status === 'fact' ? 'DOCUMENTED' : 'DISPUTED') + '</span>' +
        '<h3>' + esc(ins.title) + '</h3>' +
        '<p>' + esc(ins.body) + '</p>' +
        '<div class="based">related sites: ' + (ins.based_on || []).map(function (id) {
          return esc(byId[id] ? byId[id].name : id);
        }).join(', ') + '</div>';
      div.addEventListener('click', function () {
        div.classList.toggle('open');
        // fly to the first site it is based on
        var first = (ins.based_on || [])[0];
        if (first && byId[first]) {
          globe.controls().autoRotate = false;
          globe.pointOfView({ lat: byId[first].lat, lng: byId[first].lng, altitude: 1.6 }, 1200);
        }
      });
      listEl.appendChild(div);
    });

    // --- detail panel ------------------------------------------------------
    var detail = document.getElementById('detail');
    var detailBody = document.getElementById('detail-body');
    document.getElementById('detail-close').addEventListener('click', function () {
      detail.classList.add('hidden');
    });

    function showDetail(d) {
      globe.controls().autoRotate = false;
      var flows = arcs.filter(function (a) { return a.from === d.id || a.to === d.id; });
      var html =
        '<span class="badge ' + esc(d.status) + '">' + (d.status === 'fact' ? 'DOCUMENTED' : 'DISPUTED') + '</span>' +
        '<h2 style="margin-top:8px">' + esc(d.name) + '</h2>' +
        '<div class="place">' + esc(d.place || '') + ' · ' + esc((CATEGORIES[d.category] || {}).label || d.category) + '</div>' +
        (d.amount_label ? '<div class="amount">' + esc(d.amount_label) + '</div>' : '') +
        '<div class="asof">as of ' + esc(d.as_of || 'unknown') + '</div>' +
        '<p class="summary">' + esc(d.summary || '') + '</p>';
      if (flows.length) {
        html += '<h4>Linked sites</h4>';
        flows.forEach(function (a) {
          var other = a.from === d.id ? byId[a.to] : byId[a.from];
          var dir = a.from === d.id ? '&#8594;' : '&#8592;';
          html += '<div style="font-size:11px;color:#c6cfdd;padding:3px 0">' + dir + ' ' +
            esc(other ? other.name : '?') + ' — ' + esc(a.label) + '</div>';
        });
      }
      if (d.sources && d.sources.length) {
        html += '<h4 style="margin-top:14px">Sources</h4>';
        d.sources.forEach(function (s) {
          html += '<a class="src" target="_blank" rel="noopener" href="' + esc(s.url) + '">' +
            esc(s.title) + '<br/><span class="pub">' + esc(s.publisher || '') +
            (s.date ? ' · ' + esc(s.date) : '') + '</span></a>';
        });
      }
      detailBody.innerHTML = html;
      detail.classList.remove('hidden');
    }

    window.addEventListener('resize', function () {
      globe.width(window.innerWidth).height(window.innerHeight);
    });
  }
})();
