function createMap(domId) {
  var reds1 = ['#ff6128'];
  var reds3 = ['#fecc5c', '#fd8d3c', '#e31a1c'];
  var reds5 = ['#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
  var reds = [reds1, reds3, reds5];
  var blues1 = ['#2861ff'];
  var blues3 = ['#5cccfe', '#3c8dfd', '#1c1ae3'];
  var blues5 = ['#5cccfe', '#4cb2fe', '#3c8dfd', '#203bf0', '#1c1ae3'];
  var blues = [blues1, blues3, blues5];
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
  var markers = null;
  var positiveColors;
  var positiveQuantizer;
  var negativeColors;
  var negativeQuantizer;
  var intervalId = null;
  initMap();
  
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
    if (numericalRange > bottomCutoff && 
        numericalRange <= middleCutoff) {
      palette = palettes[1];
    } else {
      palette = palettes[2];
    }
    return palette;
  }

  function initMap() {
    map = L.map(domId).setView([39.73915, -104.9847], 10);
    markers = L.layerGroup();
    markers.addTo(map);
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png').addTo(map);
  }

  function createMarker(geohash, value) {
    var color = "white";
    if(value === 0) {
      color = "lightgrey";
    } else if (value < 0) {
      color = negativeQuantizer(Math.abs(value));
    } else {
      color = positiveQuantizer(value);
    }
    //console.log(geohash + ": val=" + value + ", color=" + color);
    return L.rectangle(
      geoHashToRect(geohash), 
      {
        fillColor: color,
        color: darkerColor(color), 
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.75
      });
  }

  return {
    add : function(grids) {
      if(intervalId) {
        window.clearInterval(intervalId);
      }
      
      //don't block UI when drawing grid cells
      var place = 0;
      intervalId = setInterval(
        function() {
          if(place >= grids.length) {
            window.clearInterval(intervalId);
          } else {
            var stopIndex = place + 250;
            if(stopIndex > grids.length) stopIndex = grids.length;
            for(var i=place; i<stopIndex; i++) {
              place++;
              markers.addLayer(createMarker(grids[i].key, grids[i].value));
            }
          }
        },
        200);
    },
    getMap : function() {
      return map;
    },
    clear : function() {
      if(intervalId) {
        window.clearInterval(intervalId);
      }
      markers.clearLayers();
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
    setScale : function(min, max) {
      console.log("Setting scale, min: " + min + ", max: " + max);
      
      if(min < 0) {
        var negMax = Math.abs(min);
        min = 0;
        var negMin = 0;
        if(max < 0) negMin = Math.abs(max);
        console.log("Split scale at zero");
        console.log("Postitive: min: " + min + ", max: " + max);
        console.log("Negative: min: " + negMin + ", max: " + negMax);

        negDomain = (negMin !== negMax) ? [negMin, negMax] : d3.scale.quantize().domain();
        negativeQuantizer = d3.scale.quantize()
          .domain(negDomain)
          .range(pickPalette(blues, negMax - negMin));
      }

      posDomain = (min !== max) ? [min, max] : d3.scale.quantize().domain();
      positiveQuantizer = d3.scale.quantize()
        .domain(posDomain)
        .range(pickPalette(reds, max - min));
    }
  }
}