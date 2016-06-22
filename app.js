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
  this.agg_geohash = function (index, geoField, prec) {
    var url = 'http://' + elastichome + '/' + index + '/report/_search';
    var post = {
      "size": 0,
      "aggs": {
        "geohash": {
          "geohash_grid": {
            "field": geoField,
            "precision": prec
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
    }
    agg_geohash();
  }

  function agg_geohash() {
    es.agg_geohash($scope.selectedIndex, $scope.selectedGeoPointField, activityMap.getPrecision()).then(function successCallback(resp) {
      activityMap.clear();
      var geoBuckets = resp.data.aggregations.geohash.buckets;
      var min = geoBuckets[0].doc_count;
      var max = geoBuckets[0].doc_count;
      geoBuckets.forEach(function (bucket) {
        if(bucket.doc_count < min) min = bucket.doc_count;
        if(bucket.doc_count > max) max = bucket.doc_count;
      });
      activityMap.setScale(min, max);
      geoBuckets.forEach(function (bucket) {
        activityMap.addMarker(bucket.key, bucket.doc_count);
      });
    }, function errorCallback(resp) {
      console.debug("error", resp);
    });
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
      console.debug("resp", resp);
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