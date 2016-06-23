createTimeline = function(domId) {
  var xScale;
  var vis;

  function initVis(buckets) {
    var padding = 35;
    var width = document.getElementById(domId).offsetWidth;
    var height = document.getElementById(domId).offsetHeight;
    bucketWidth = buckets[1].key - buckets[0].key;

    var vis = d3.select('#' + domId)
      .append("svg:svg")
        .attr("width", width)
        .attr("height", height);

    var mindate = buckets[0].key;
    var maxdate = buckets[buckets.length - 1].key + bucketWidth;
    xScale = d3.time.scale()
      .domain([mindate, maxdate])
      .range([0, width]);
    var xAxis = d3.svg.axis()
      .orient("bottom")
      .scale(xScale);
    vis.append("g")
      .attr("class", "xaxis")   // give it a class so it can be used to select only xaxis labels  below
      .attr("transform", "translate(0," + (height - padding) + ")")
      .call(xAxis);
  }

  return {
    draw : function(buckets) {
      initVis(buckets);
    }
  }
}