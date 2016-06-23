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
    var url = 'http://' + elastichome + '/' + options.index + '/report/_search';
    var post = {
      "query": {
        "range": {
          [options.dateField]: {
            "gte": "2014-08-01T00:00:00.000", 
            "lte": "2014-08-30T23:59:59.999", 
            "time_zone": "America/Denver"
          }
        }
      },
      "size": 0,
      "aggs": {
        "date_buckets":{
          "date_histogram": {
            "field": options.dateField,
            "interval": "day",
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
                "window": 30,
                "model": "holt_winters",
                "settings": {
                  "type": "mult",
                  "period": 7
                }
              }  
            }
          }
        },
        "geo_buckets": {
          "geohash_grid": {
            "field": options.geoField,
            "precision": options.prec
          },
          "aggs": {
            "date_buckets":{
              "date_histogram": {
                "field": options.dateField,
                "interval": "day",
                "min_doc_count": 0,
                "extended_bounds": {
                    "min": "2014-08-01T00:00:00.000",
                    "max": "2014-08-30T23:59:59.999"
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
                    "window": 30,
                    "model": "holt_winters",
                    "settings": {
                      "type": "mult",
                      "period": 7
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
  var activityMap = Map.createMap('activityMap');
  activityMap.onZoom(function() {
    startAggs();
  });
  var normalizedMap = Map.createMap('normalizedMap');
  var cachedResults = null;

  $scope.indices = [];
  $scope.elastichome = "localhost:9200";
  loadIndices();

  $scope.loadIndices = loadIndices;
  $scope.loadFields = loadFields;

  $scope.start = startAggs;

  function startAggs() {
    if(!$scope.elastichome) {
      $scope.appStatus = "Please specify elasticsearch ip and port";
    } else if (!$scope.selectedIndex) {
      $scope.appStatus = "Please select an index";
    } else if (!$scope.selectedGeoPointField) {
      $scope.appStatus = "Please select a geo_point field";
    } else if (!$scope.selectedDateField) {
      $scope.appStatus = "Please select a date field";
    }
    agg_geohash();
  }

  function agg_geohash() {
    es.fetchData({
      "index": $scope.selectedIndex, 
      "geoField": $scope.selectedGeoPointField, 
      "dateField": $scope.selectedDateField,
      "geohash_precision": activityMap.getPrecision()
    })
    .then(function successCallback(resp) {
      cachedResults = resp.data;
      drawActivityMap();
      drawNormalizedMap();
    }, function errorCallback(resp) {
      $scope.appStatus = "Unable to execute POST, ensure CORs is enabled for POST"
    });
  }

  function drawActivityMap() {
    activityMap.clear();
    var dateBucketIndex = 29; //todo - dynamically set from bar chart
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

  function drawNormalizedMap() {
    normalizedMap.clear();
    var dateBucketIndex = 29; //todo - dynamically set from bar chart
    var geoBuckets = cachedResults.aggregations.geo_buckets.buckets;
    var min = normalize(geoBuckets[0].date_buckets.buckets[dateBucketIndex]);
    var max = min;
    geoBuckets.forEach(function (bucket) {
      var val = normalize(bucket.date_buckets.buckets[dateBucketIndex]);
      if(val < min) min = val;
      if(val > max) max = val;
    });
    normalizedMap.setScale(min, max);
    geoBuckets.forEach(function (bucket) {
      normalizedMap.addMarker(bucket.key, normalize(bucket.date_buckets.buckets[dateBucketIndex]));
    });
  }

  function normalize(bucket) {
    var normalized = 0;
    if (bucket.seasonal_avg) normalized = bucket.doc_count - bucket.seasonal_avg.value;
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
      var props = resp.data[$scope.selectedIndex].mappings.report.properties;
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