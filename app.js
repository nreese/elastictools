var app = angular.module('elasticpipeApp', []);

app.service('es', function($http) {
  var elastichome = "localhost:9200";
  this.setElasticHome = function (val) {
    elastichome = val;
  }
  this.getIndices = function () {
    var url = 'http://' + elastichome + '/_stats/index,store';
    return $http.get(url);
  }
  this.getMapping = function (index) {
    var url = 'http://' + elastichome + '/' + index + '/_mapping';
    return $http.get(url);
  }
  this.fetchData = function (options) {
    var url = 'http://' + elastichome + '/' + options.index + '/' + options.type + '/_search';
    var post = {
      "query": {
        "range": {
          [options.dateField]: {
            "gte": options.start, 
            "lte": options.stop, 
            "time_zone": "America/Denver"
          }
        }
      },
      "size": 0,
      "aggs": {
        "date_buckets":{
          "date_histogram": {
            "field": options.dateField,
            "interval": options.interval,
            "time_zone": "America/Denver",
            "min_doc_count": 0,
            "extended_bounds": {
                "min": options.start,
                "max": options.stop
            }
          },
          "aggs": {
            "histo_bin_count": {
              "value_count": {
                "field": options.dateField
              }
            },
            "seasonal_avg": {
              "moving_avg": {
                "buckets_path": "histo_bin_count",
                "window": options.seasonality * 4,
                "model": "holt_winters",
                "settings": {
                  "type": "mult",
                  "period": options.seasonality
                }
              }  
            }
          }
        },
        "geo_buckets": {
          "geohash_grid": {
            "field": options.geoField,
            "precision": options.geohash_precision
          },
          "aggs": {
            "date_buckets":{
              "date_histogram": {
                "field": options.dateField,
                "interval": options.interval,
                "min_doc_count": 0,
                "extended_bounds": {
                    "min": options.start,
                    "max": options.stop
                },
                "time_zone": "America/Denver"
              },
              "aggs": {
                "histo_bin_count": {
                  "value_count": {
                    "field": options.dateField
                  }
                },
                "seasonal_avg": {
                  "moving_avg": {
                    "buckets_path": "histo_bin_count",
                    "window": options.seasonality * 4,
                    "model": "holt_winters",
                    "settings": {
                      "type": "mult",
                      "period": options.seasonality
                    }
                  }  
                }
              }
            }
          }
        }
      }
    }
    return $http.post(url, post);
  }
});

app.controller('MapController', function MapController($scope, es) {
  var lastGeoPrecision = -1;
  var selectedDateBucket = null;
  var timeline = createTimeline('timeline');
  
  var activityMap = createMap('activityMap');
  activityMap.onZoom(function() {
    //only reload data if there is a new percision level 
    var newPrecision = activityMap.getPrecision();
    if (newPrecision !== lastGeoPrecision) {
      lastGeoPrecision = newPrecision;
      loadData();
    }
  });
  var normalizedMap = createMap('normalizedMap');
  normalizedMap.getMap().sync(activityMap.getMap());
  activityMap.getMap().sync(normalizedMap.getMap());
  var cachedResults = null;

  timeline.onSelect(function(key) {
    selectedDateBucket = key;
    var dateBucketIndex = 0;
    var dateBuckets = cachedResults.aggregations.date_buckets.buckets;
    for(var i=0; i<dateBuckets.length; i++) {
      if(dateBuckets[i].key === key) {
        dateBucketIndex = i;
        break;
      }
    }
    console.log("redrawing map, date bucket index:" + dateBucketIndex);
    drawNormalizedMap(dateBucketIndex);
    drawActivityMap(dateBucketIndex);
  });

  $scope.indices = [];
  $scope.elastichome = "localhost:9200";
  $scope.start = "2014-08-01T00:00:00.000";
  $scope.stop = "2014-08-30T23:59:59.999";
  loadIndices();

  $scope.loadIndices = loadIndices;
  $scope.loadFields = loadFields;

  $scope.load = loadData;

  $scope.setView = function() {
    activityMap.getMap().setView(
      [$scope.lat, $scope.lon], 
      $scope.zoom);
  }

  function loadData() {
    if(!$scope.elastichome) {
      $scope.appStatus = "Please specify elasticsearch ip and port";
    } else if (!$scope.selectedIndex) {
      $scope.appStatus = "Please select an index";
    } else if (!$scope.selectedGeoPointField) {
      $scope.appStatus = "Please select a geo_point field";
    } else if (!$scope.selectedDateField) {
      $scope.appStatus = "Please select a date field";
    } else if (!$scope.start) {
      $scope.appStatus = "Please start field, format yyyy-mm-ddTHH:MM:SS.sss";
    } else if (!$scope.stop) {
      $scope.appStatus = "Please stop field, format yyyy-mm-ddTHH:MM:SS.sss";
    } else {
      agg_geohash();
    }
  }

  function agg_geohash() {
    activityMap.clear();
    normalizedMap.clear();
    cachedResults = null;
    var interval = calculateDateHistogramInterval($scope.start, $scope.stop);
    es.fetchData({
      "index": $scope.selectedIndex,
      "type": $scope.selectedType,
      "geoField": $scope.selectedGeoPointField, 
      "dateField": $scope.selectedDateField,
      "geohash_precision": activityMap.getPrecision(),
      "start": $scope.start,
      "stop": $scope.stop,
      "interval": interval.interval,
      "seasonality": interval.period
    })
    .then(function successCallback(resp) {
      cachedResults = resp.data;
      drawTimeline();
    }, function errorCallback(resp) {
      $scope.appStatus = "Unable to execute POST, ensure CORs is enabled for POST"
    });
  }

  //pick interval that provides enough buckets for seasonality
  function calculateDateHistogramInterval(start, stop) {
    const MSEC_PER_HOUR =  1000 * 60 * 60;
    var startDate = Date.parse(start);
    var stopDate = Date.parse(stop);
    var duration = stopDate - startDate;
    var interval = {};
    if (duration <= MSEC_PER_HOUR * 250) { //less than 3.5 weeks
      interval.interval = "hour";
      interval.period = 24;
    } else if (duration <= MSEC_PER_HOUR * 24 * 250) {
      interval.interval = "day";
      interval.period = 7;
    } else if (duration <= MSEC_PER_HOUR * 24 * 7 * 250) {
      interval.interval = "week";
      interval.period = 4;
    } else {
      interval.interval = "month";
      interval.period = 12;
    }
    console.log("duration: " + duration + ", interval: " + interval.interval);
    return interval;
  }

  function drawActivityMap(dateBucketIndex) {
    activityMap.clear();
    var geoBuckets = cachedResults.aggregations.geo_buckets.buckets;
    var min = geoBuckets[0].date_buckets.buckets[dateBucketIndex].doc_count;
    var max = min;
    geoBuckets.forEach(function (bucket) {
      var val = bucket.date_buckets.buckets[dateBucketIndex].doc_count;
      if(val < min) min = val;
      if(val > max) max = val;
    });
    activityMap.setScale(min, max);
    geoBuckets.forEach(function (bucket) {
      activityMap.addMarker(bucket.key, bucket.date_buckets.buckets[dateBucketIndex].doc_count);
    });
  }

  function drawNormalizedMap(dateBucketIndex) {
    normalizedMap.clear();
    var geoBuckets = cachedResults.aggregations.geo_buckets.buckets;
    /*var min = normalize(geoBuckets[0].date_buckets.buckets[dateBucketIndex]);
    var max = min;
    geoBuckets.forEach(function (bucket) {
      var val = normalize(bucket.date_buckets.buckets[dateBucketIndex]);
      if(val < min) min = val;
      if(val > max) max = val;
    });*/
    var max = geoBuckets[0].date_buckets.buckets[dateBucketIndex].doc_count;
    geoBuckets.forEach(function (bucket) {
      var val = bucket.date_buckets.buckets[dateBucketIndex].doc_count;
      if(val > max) max = val;
    });
    normalizedMap.setScale(-1 * max, max);
    geoBuckets.forEach(function (bucket) {
      normalizedMap.addMarker(bucket.key, normalize(bucket.date_buckets.buckets[dateBucketIndex]));
    });
  }

  function drawTimeline() {
    timeline.draw(cachedResults.aggregations.date_buckets.buckets);
    if(selectedDateBucket) {
      timeline.selectBucket(selectedDateBucket);
    }
  }

  function normalize(bucket) {
    var normalized = 0;
    if (bucket.seasonal_avg) normalized = Math.round(bucket.doc_count - bucket.seasonal_avg.value);
    return normalized;
  }

  function loadIndices() {
    $scope.indices = [];
    es.setElasticHome($scope.elastichome);
    es.getIndices().then(function successCallback(resp) {
      Object.keys(resp.data.indices).forEach(function (index) {
        if (index.charAt(0) != '.') $scope.indices.push(index);
      });
      $scope.appStatus = "Please select an index from Elastic Cluster running at " + $scope.elastichome;
    }, function errorCallback(resp) {
      $scope.appStatus = "Unable to access Elastic Cluster at " + $scope.elastichome;
      $scope.appStatus += ". Ensure the ip and port are correct and CORS is enabled on your Elastic Cluser" 
    });
  }

  function loadFields() {
    $scope.geoPointFields = [];
    $scope.dateFields = [];
    es.getMapping($scope.selectedIndex).then(function successCallback(resp) {
      var types = Object.keys(resp.data[$scope.selectedIndex].mappings);
      $scope.selectedType = types[0];
      var props = resp.data[$scope.selectedIndex].mappings[$scope.selectedType].properties;
      Object.keys(props).forEach(function (prop) {
        if (props[prop].type === 'geo_point') {
          $scope.geoPointFields.push(prop);
        } else if (props[prop].type === 'date') {
          $scope.dateFields.push(prop);
        }
      });
      if ($scope.geoPointFields.length > 0 && $scope.dateFields.length > 0) {
        $scope.appStatus = "Please select a geo_point field and a date field.";
      } else {
        $scope.appStatus = "Selected index has no geo_point fields and/or date fields, please select an index containing fields with these types";
      }
    }, function errorCallback(resp) {
      $scope.appStatus = "Unable to pull mapping for index " + $scope.selectedIndex;
    });
  }
});
