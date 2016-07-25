function QuantizedMap(domId) {
  // zoomPrecision maps event.zoom to a geohash precision value
  // event.limit is the configurable max geohash precision
  // default max precision is 7, configurable up to 12
  const zoomPrecision = {
    1: 2,
    2: 2,
    3: 2,
    4: 3,
    5: 3,
    6: 4,
    7: 4,
    8: 5,
    9: 5,
    10: 6,
    11: 6,
    12: 7,
    13: 7,
    14: 8,
    15: 9,
    16: 10,
    17: 11,
    18: 12
  };
  var maxPrecision = 7;
  var map = null;
  var control = null;
  var layers = {};
  var legend = null;
  var intervalId = null;
  var selectedLayerId = null;
  initMap();
  
  function initMap() {
    map = L.map(domId).setView([39.73915, -104.9847], 9);
    control = L.control.layers();
    control.addTo(map);
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(map);

    map.on('baselayerchange', function(e) {
      selectedLayerId = findLayerByTitle(e.name);
      createLegend(layers[layerId]);
    });
  }

  function format(num) {
    if (num === 0) return 1;
    return Math.round(num * 10) / 10;
  }

  function findLayerByTitle(title) {
    layerId = null;
    var ids = Object.keys(layers);
    for (var i=0; i<ids.length; i++) {
      var id = ids[i];
      if(layers[id].getTitle() === title) {
        layerId = id;
        break;
      }
    }
    return layerId;
  }

  function destroyLegend() {
    if (legend) {
      legend.removeFrom(map);
      legend = null;
    }
  }

  function createLegend(quantizedLayer) {
    destroyLegend();
    var levels = [];
    var colors = quantizedLayer.getPosQuantizer().range();
    for(var i=colors.length-1; i>=0; i--) {
      var numRange = quantizedLayer.getPosQuantizer().invertExtent(colors[i]);
      levels.push({
        color: colors[i],
        value: format(numRange[1]) + "-" + format(numRange[0])
      });
    }
    levels.push({
      color: 'lightgrey',
      value: 0
    });
    if(quantizedLayer.getNegQuantizer()) {
      quantizedLayer.getNegQuantizer().range().forEach(function(color) {
        var numRange = quantizedLayer.getNegQuantizer().invertExtent(color);
        levels.push({
          color: color,
          value: format(numRange[0]) + "-" + format(numRange[1])
        });
      });
    }

    legend = L.control({position: 'bottomright'});
    legend.onAdd = function () {
      var legendDiv = L.DomUtil.create('div', 'legend');
      levels.forEach(function(level) {
        var levelDiv = L.DomUtil.create('div');
        levelDiv.innerHTML = '<i style="background:' + level.color + '"></i> ' + level.value;
        legendDiv.appendChild(levelDiv);
      });
      return legendDiv;
    };
    legend.addTo(map);
  }

  return {
    add : function(layerId, grids) {
      grids.forEach(function(grid) {
        layers[layerId].addCell(grid.key, grid.value, grid.txt);
      });
      /*if(intervalId) {
        window.clearInterval(intervalId);
      }
      
      //don't block UI when drawing grid cells
      var place = 0;
      intervalId = setInterval(
        function() {
          var stopIndex = place + 250;
          if(stopIndex > grids.length) {
            stopIndex = grids.length;
            window.clearInterval(intervalId);
          }
          for(var i=place; i<stopIndex; i++) {
            place++;
            markers.addLayer(createMarker(grids[i].key, grids[i].value));
          }
        },
        200);*/

    },
    createLayer : function(id, title) {
      if (!(id in layers)) {
        layers[id] = QuantizedLayer(title);
        control.addBaseLayer(layers[id].getLayer(), title);
      }
    },
    draw : function() {
      if(!selectedLayerId) {
        selectedLayerId = Object.keys(layers)[0];
        map.addLayer(layers[selectedLayerId].getLayer());
        console.log("No active layers, defaulting to layer[0]: " + selectedLayerId);
      }
      createLegend(layers[selectedLayerId]);
    },
    getMap : function() {
      return map;
    },
    clear : function() {
      if(intervalId) {
        window.clearInterval(intervalId);
      }
      if (legend) {
        legend.removeFrom(map);
        legend = null;
      }
      Object.keys(layers).forEach(function(id) {
        layers[id].clearLayer();
      });
    },
    getPrecision : function() {
      var precision = zoomPrecision[map.getZoom()];
      if (precision > maxPrecision) {
        return maxPrecision;
      }
      return precision;
    },
    onZoom : function(callback) {
      map.on('zoomend', function () {
        callback();
      });
    },
    setPopup : function(flag) {
      Object.keys(layers).forEach(function(id) {
        layers[id].setPopup(flag);
      });
    },
    setScale : function(layerId, min, max) {
      if (!(layerId in layers)) {
        throw layerId + " layer does not exist.";
      }
      layers[layerId].setScale(min, max);
    }
  }
}

function QuantizedLayer(title) {
  const reds1 = ['#ff6128'];
  const reds3 = ['#fecc5c', '#fd8d3c', '#e31a1c'];
  const reds5 = ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
  const reds = [reds1, reds3, reds5];
  const blues1 = ['#2861ff'];
  const blues3 = ['#5cccfe', '#3c8dfd', '#1c1ae3'];
  const blues5 = ['#5cccfe', '#4cb2fe', '#3c8dfd', '#203bf0', '#1c1ae3'];
  const blues = [blues1, blues3, blues5];

  var _leafletLayer = L.layerGroup();
  var _negativeQuantizer = null;
  var _popupEnabled = true;
  var _positiveQuantizer = null;
  var _title = title;

  function geoHashToRect(geohash) {
    var grid = Geohash.bounds(geohash);
    var sw = L.latLng(grid.sw.lat, grid.sw.lon);
    var ne = L.latLng(grid.ne.lat, grid.ne.lon);
    return L.latLngBounds(sw, ne);
  }

  function darkerColor(color, amount) {
    var amount = amount || 1.3;
    return d3.hcl(color).darker(amount).toString();
  };

  function pickPalette(palettes, numericalRange) {
    var bottomCutoff = 2;
    var middleCutoff = 24;
    var palette = palettes[0];
    if (numericalRange <= bottomCutoff) {
      palette = palettes[0];
    } else if (numericalRange <= middleCutoff) {
      palette = palettes[1];
    } else {
      palette = palettes[2];
    }
    return palette;
  }

  return {
    addCell : function(geohash, value, popupContent) {
      var color = "white";
      if(value === 0) {
        color = "lightgrey";
      } else if (value < 0) {
        color = _negativeQuantizer(Math.abs(value));
      } else {
        color = _positiveQuantizer(value);
      }
      //console.log(geohash + ": val=" + value + ", color=" + color);
      var grid = L.rectangle(
        geoHashToRect(geohash), 
        {
          fillColor: color,
          color: darkerColor(color), 
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.75
        });
      grid.bindPopup(popupContent);
      grid.on('mouseover', function (e) {
          if(_popupEnabled) {
            this.openPopup();
          }
      });
      grid.on('mouseout', function (e) {
          this.closePopup();
      });
      _leafletLayer.addLayer(grid);
    },
    clearLayer : function() {
      _leafletLayer.clearLayers();
    },
    getLayer : function() {
      return _leafletLayer;
    },
    getNegQuantizer : function() {
      return _negativeQuantizer;
    },
    getPosQuantizer : function() {
      return _positiveQuantizer;
    },
    getTitle : function() {
      return _title;
    },
    setPopup : function(flag) {
      _popupEnabled = flag;
    },
    setScale : function(min, max) {
      console.log("Setting scale, min: " + min + ", max: " + max);
      _negativeQuantizer = null;
      if(min < 0) {
        var negMax = Math.abs(min);
        min = 0;
        var negMin = 0;
        if(max < 0) negMin = Math.abs(max);
        console.log("Split scale at zero");
        console.log("Postitive: min: " + min + ", max: " + max);
        console.log("Negative: min: " + negMin + ", max: " + negMax);

        var negDomain = (negMin !== negMax) ? [negMin, negMax] : d3.scale.quantize().domain();
        _negativeQuantizer = d3.scale.quantize()
          .domain(negDomain)
          .range(pickPalette(blues, negMax - negMin));
      }

      var posDomain = (min !== max) ? [min, max] : d3.scale.quantize().domain();
      _positiveQuantizer = d3.scale.quantize()
        .domain(posDomain)
        .range(pickPalette(reds, max - min));
    }
  }
}