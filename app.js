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
              "moving_avg": options.movingAvg
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
                  "moving_avg": options.movingAvg
                },
                "deviationFromMovavg": {
                  "bucket_script": {
                    "buckets_path": {
                      "count": "histo_bin_count",
                      "movavg": "seasonal_avg"
                    },
                    "script": "(count - movavg).abs()"
                  }
                }
              }
            },
            "count_stats": {
              "extended_stats_bucket": {
                "buckets_path": "date_buckets>histo_bin_count"
              }
            },
            "deviationFromMovavg_stats": {
              "extended_stats_bucket": {
                "buckets_path": "date_buckets>deviationFromMovavg"
              }
            }
          }
        }
      }
    }
    return $http.post(url, post);
  }
});

app.directive('movingAvgInput', [
  function(){
    return {
      restrict : 'E',
      scope : {
        movingAvg : "=ngModel"
      },
      link : function(scope, element, attrs){
        scope.movingAvg = {
          buildRequest : function(buckets_path, window, period) {
            var request = {
              buckets_path: buckets_path,
              window : window,
              model : scope.model,
              settings : {}
            }
            if (scope.model === 'ewma') {
              request.settings.alpha = scope.alpha;
            }
            if (scope.model === 'holt') {
              request.settings.alpha = scope.alpha;
              request.settings.beta = scope.beta;
            }
            if (scope.model === 'holt_winters') {
              request.settings.alpha = scope.alpha;
              request.settings.beta = scope.beta;
              request.settings.gamma = scope.gamma;
              request.settings.type = "mult";
              request.settings.period = period;
            }
            return request;
          }
        };
        scope.model="holt_winters";
        scope.alpha = 0.3;
        scope.beta = 0.1;
        scope.gamma = 0.3;
        scope.simpleTooltip = 
"The simple model calculates the sum of all values in the window, \
then divides by the size of the window. \
It is effectively a simple arithmetic mean of the window.";
        scope.linearTooltip =
"The linear model assigns a linear weighting to points in the series, \
such that 'older' datapoints (e.g. those at the beginning of the window) \
contribute a linearly less amount to the total average.";
        scope.ewmaTooltip = 
"The single-exponential model is similar to the linear model, \
except older data-points become exponentially less important, rather than linearly less important. \
The speed at which the importance decays can be controlled with an alpha setting. \
Small values make the weight decay slowly. \
Larger valuers make the weight decay quickly, which reduces the impact of older values on the moving average";
        scope.holtTooltip = 
"The double exponential model incorporates a second exponential term, beta, \
which tracks the data's slope. \
Small values emphasize long-term trends (such as a constant linear trend in the whole series), \
while larger values emphasize short-term trends";
        scope.holtWintersTooltip = 
"The triple exponential model incorporates a third exponential term, gamma, \
which tracks the seasonal aspect of the data";
      },
      template:  '<div>\
                    <span>Moving Average Model<span>\
                    <select ng-model="model">\
                      <option value="simple" title={{simpleTooltip}}>simple</option>\
                      <option value="linear" title={{linearTooltip}}>linear</option>\
                      <option value="ewma" title={{ewmaTooltip}}>single exponential</option>\
                      <option value="holt" title={{holtTooltip}}>double exponential</option>\
                      <option value="holt_winters" title={{holtWintersTooltip}}>triple exponential</option>\
                    </select>\
                    <input type="number" step="0.1" min="0" max="1" ng-show="[\'ewma\', \'holt\', \'holt_winters\'].indexOf(model)!=-1" ng-model="alpha" placeholder="alpha"></input>\
                    <input type="number" step="0.1" min="0" max="1" ng-show="[\'holt\', \'holt_winters\'].indexOf(model)!=-1" ng-model="beta" placeholder="beta"></input>\
                    <input type="number" step="0.1" min="0" max="1" ng-show="[\'holt_winters\'].indexOf(model)!=-1" ng-model="gamma" placeholder="gamma"></input>\
                  </div>'
    };
  }
]);

app.controller('MapController', function MapController($scope, es) {
  var lastGeoPrecision = -1;
  var selectedDateBucket = null;
  var timeline = createTimeline('timeline');
  
  var activityMap = QuantizedMap('activityMap');
  activityMap.onZoom(function() {
    //only reload data if there is a new percision level 
    var newPrecision = activityMap.getPrecision();
    if (newPrecision !== lastGeoPrecision) {
      lastGeoPrecision = newPrecision;
      loadData();
    }
  });
  activityMap.createLayer("activity", "Activity");

  var normalizedMap = QuantizedMap('normalizedMap');
  const BASELINE_LAYER = "movavg";
  const STDEV_THRESHOLD_LAYER = "stdevThreshold";
  normalizedMap.createLayer(BASELINE_LAYER, "Distance from baseline");
  normalizedMap.createLayer(STDEV_THRESHOLD_LAYER, "Outside STDEV threshold");
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

    drawActivityMap(dateBucketIndex);
    drawNormalizedMap(dateBucketIndex);
  });

  $scope.movingAvg = null; //initialized by directive movingAvgInput
  $scope.indices = [];
  $scope.elastichome = "localhost:9200";
  $scope.start = "2014-07-01T00:00:00.000";
  $scope.stop = "2014-08-30T23:59:59.999";
  $scope.stdevThreshold = 3;
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
    $scope.appStatus = "Loading data from elasticsearch..."
    timeline.clear();
    activityMap.clear();
    normalizedMap.clear();
    cachedResults = null;
    var interval = calculateDateHistogramInterval($scope.start, $scope.stop);
    es.fetchData({
      index: $scope.selectedIndex,
      type: $scope.selectedType,
      geoField: $scope.selectedGeoPointField, 
      dateField: $scope.selectedDateField,
      geohash_precision: activityMap.getPrecision(),
      start: $scope.start,
      stop: $scope.stop,
      interval: interval.interval,
      movingAvg: $scope.movingAvg.buildRequest("histo_bin_count", interval.period * 4, interval.period)
    })
    .then(function successCallback(resp) {
      $scope.appStatus = null;
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
    var min = 0;
    var max = 0;
    var grids = [];
    geoBuckets.forEach(function (geoBucket) {
      var dateBucket = geoBucket.date_buckets.buckets[dateBucketIndex];
      if (dateBucket.doc_count > max) max = dateBucket.doc_count;
      grids.push({
        key: geoBucket.key,
        value: dateBucket.doc_count,
        txt: activityGridTxt(
          geoBucket.key,
          getDateSpan(geoBuckets[0]),
          cachedResults.aggregations.date_buckets.buckets.length, 
          dateBucket, 
          geoBucket.count_stats)
      });
    });
    activityMap.setScale("activity", min, max);
    activityMap.add("activity", grids);
    activityMap.draw();
  }

  function drawNormalizedMap(dateBucketIndex) {
    normalizedMap.clear();
    var geoBuckets = cachedResults.aggregations.geo_buckets.buckets;
    var max = geoBuckets[0].date_buckets.buckets[dateBucketIndex].doc_count;
    var movAvgGrids = [];
    var stdevGrids = [];
    geoBuckets.forEach(function (geoBucket) {
      var dateBucket = geoBucket.date_buckets.buckets[dateBucketIndex];
      if (dateBucket.doc_count > max) max = dateBucket.doc_count;

      var normalized = normalize(dateBucket);
      var sigmaAlert = 0;
      var txt = "No Data";
      if (dateBucket.deviationFromMovavg) {
        var sigma = dateBucket.deviationFromMovavg.value / geoBucket.deviationFromMovavg_stats.std_deviation;
        if(sigma > $scope.stdevThreshold) {
          sigmaAlert = 1;
          if(normalized < 0) sigmaAlert = sigmaAlert * -1;
        }
        txt = normalizedGridTxt(
          geoBucket.key,
          getDateSpan(geoBuckets[0]),
          cachedResults.aggregations.date_buckets.buckets.length, 
          dateBucket, 
          geoBucket.deviationFromMovavg_stats,
          normalized,
          sigma);
      }
      movAvgGrids.push({
        key: geoBucket.key,
        value: normalized,
        txt: txt
      });
      stdevGrids.push({
        key: geoBucket.key,
        value: sigmaAlert,
        txt: txt
      });
    });

    normalizedMap.setScale(BASELINE_LAYER, -1 * max, max);
    normalizedMap.add(BASELINE_LAYER, movAvgGrids);
    normalizedMap.setScale(STDEV_THRESHOLD_LAYER, -1, 1);
    normalizedMap.add(STDEV_THRESHOLD_LAYER, stdevGrids);
    normalizedMap.draw();
  }

  function getDateSpan(geoBucket) {
    return geoBucket.date_buckets.buckets[1].key - geoBucket.date_buckets.buckets[0].key;
  }

  function activityGridTxt(gridKey, dateSpan, numDateBuckets, dateBucket, countStats) {
    var percent = ((countStats.count / numDateBuckets) * 100).toFixed(1);
    var summary = 'Grid has activity ' + percent + '% of date histogram bins.';
    if(percent < 75) {
      summary += ' <span class="warn small">\
        Large holes in timeseries data limit the uesfulness of moving averages and statstical analysis. \
        Take this into consideration when interpreting results about this grid cell.\
      </span>';
    }
    return '\
      <h4 style="margin: 0 0 1px 0;">' + prettyPrintDateSpan(dateBucket.key, dateSpan, "MMM Do YYYY") + '</h4>\
      <dl>\
        <dt>Count</dt>\
        <dd>' + dateBucket.doc_count + '</dd>\
      </dl>\
      <h4 style="margin: 3px 0 1px 0;">Count Stats for grid ' + gridKey + '</h4>\
      <p style="margin: 0;">' + summary + '</p>\
      <dl>\
        <dt>Min</dt>\
        <dd>' + countStats.min + '</dd>\
        <dt>Max</dt>\
        <dd>' + countStats.max + '</dd>\
        <dt>Avg</dt>\
        <dd>' + countStats.avg.toFixed(2) + '</dd>\
        <dt>STDEV</dt>\
        <dd>' + countStats.std_deviation.toFixed(2) + '</dd>\
      </dl>';
  }

  function normalizedGridTxt(gridKey, dateSpan, numDateBuckets, dateBucket, stats, deviation, sigma) {
    var percent = ((stats.count / numDateBuckets) * 100).toFixed(1);
    var summary = 'Grid has activity ' + percent + '% of date histogram bins.';
    if(percent < 75) {
      summary += ' <span class="warn small">\
        Large holes in timeseries data limit the uesfulness of moving averages and statstical analysis. \
        Take this into consideration when interpreting results about this grid cell.\
      </span>';
    }
    return '\
      <h4 style="margin: 0 0 1px 0;">' + prettyPrintDateSpan(dateBucket.key, dateSpan, "MMM Do YYYY") + '</h4>\
      <dl>\
        <dt>Count</dt>\
        <dd>' + dateBucket.doc_count + '</dd>\
        <dt>Expected</dt>\
        <dd>' + dateBucket.seasonal_avg.value.toFixed(0) + '</dd>\
        <dt>Deviation</dt>\
        <dd>' + deviation + '</dd>\
      </dl>\
      <h4 style="margin: 3px 0 1px 0;">Deviation Stats for grid ' + gridKey + '</h4>\
      <p style="margin: 0;">' + summary + '</p>\
      <dl>\
        <dt>Min</dt>\
        <dd>' + stats.min.toFixed(2) + '</dd>\
        <dt>Max</dt>\
        <dd>' + stats.max.toFixed(2) + '</dd>\
        <dt>Avg</dt>\
        <dd>' + stats.avg.toFixed(2) + '</dd>\
        <dt>STDEV</dt>\
        <dd>' + stats.std_deviation.toFixed(2) + '</dd>\
        <dt>Sigma</dt>\
        <dd>' + sigma.toFixed(2) + '</dd>\
      </dl>';
  }

  function prettyPrintDateSpan(start, width, format) {
    var start = moment(start);
    var end = moment(start + width);
    return start.format(format) + " to " + end.format(format);
  }

  function drawTimeline() {
    timeline.draw(cachedResults.aggregations.date_buckets.buckets);
    if(selectedDateBucket) {
      timeline.selectBucket(selectedDateBucket);
    }
  }

  function normalize(bucket) {
    var normalized = 0;
    if (bucket.seasonal_avg) {
      normalized = Math.round(bucket.doc_count - bucket.seasonal_avg.value);
      //console.log("bucket count: " + bucket.doc_count + ", seasonal avg: " + bucket.seasonal_avg.value + ", normalized value: " + normalized);
    }
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
