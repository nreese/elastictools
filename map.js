Map.createMap = function(domId) {
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

  var map = L.map(domId).setView([39.73915, -104.9847], 10);
  var markers = L.layerGroup();
  var legendColors;
  var legendQuantizer;
  markers.addTo(map);
  L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  function geoHashToRect(geohash) {
    var grid = Geohash.bounds(geohash);
    var sw = L.latLng(grid.sw.lat, grid.sw.lon);
    var ne = L.latLng(grid.ne.lat, grid.ne.lon);
    return L.latLngBounds(sw, ne);
  }

  function darkerColor(color, amount) {
    amount = amount || 1.3;
    return d3.hcl(color).darker(amount).toString();
  };

  return {
    clear : function() {
      markers.clearLayers()
    },
    getPrecision : function() {
      precision = zoomPrecision[map.getZoom()];
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
    setScale : function(min, max) {
      console.log("Setting scale, min: " + min + ", max: " + max);
      var reds1 = ['#ff6128'];
      var reds3 = ['#fecc5c', '#fd8d3c', '#e31a1c'];
      var reds5 = ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
      var bottomCutoff = 2;
      var middleCutoff = 24;
      if (max - min <= bottomCutoff) {
        legendColors = reds1;
      } else if (max - min <= middleCutoff) {
        legendColors = reds3;
      } else {
        legendColors = reds5;
      }
      quantizeDomain = (min !== max) ? [min, max] : d3.scale.quantize().domain();
      legendQuantizer = d3.scale.quantize().domain(quantizeDomain).range(legendColors);
    },
    addMarker : function(geohash, value) {
      var color = legendQuantizer(value);
      marker = L.rectangle(
        geoHashToRect(geohash), 
        {
          fillColor: color,
          color: darkerColor(color), 
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.75
        });
      markers.addLayer(marker);
    }
  }
}