createTimeline = function(domId) {
  var xScale;
  var barWidth;
  var yScale;
  var vis;
  var width = 100;
  var height = 100;
  var padding = 20;

  var selectCallback = function(key) {
    console.log("Default callback, please pass callback to onSelect.");
  }

  function setX(buckets) {
    var bucketWidth = buckets[1].key - buckets[0].key;
    var mindate = buckets[0].key;
    var maxdate = buckets[buckets.length - 1].key;
    //pad min/max so centered bars do not overlow
    mindate = mindate - (bucketWidth/2);
    maxdate = maxdate + (bucketWidth/2);

    xScale = d3.time.scale()
      .domain([mindate, maxdate])
      .range([0, width]);
    const barGap = 4;

    barWidth = xScale(buckets[1].key) - xScale(buckets[0].key);
    if(barWidth > 10) barWidth = barWidth - barGap; //only pad bars when they are large
    if(barWidth <= 0) barWidth = 1; 
  }

  function setY(buckets) {
    var min = 0;
    var max = buckets[0].doc_count;
    buckets.forEach(function(bucket) {
      var val = bucket.doc_count;
      if(bucket.seasonal_avg && bucket.seasonal_avg.value > val) val = bucket.seasonal_avg.value;
      if(val > max) max = val;
    });
    yScale = d3.scale.linear()
      .domain([min, max])
      .range([height - padding, 0]);
  }

  function initVis(buckets) {
    var svgId = "svg_" + domId;
    width = document.getElementById(domId).offsetWidth;
    height = document.getElementById(domId).offsetHeight;
    setX(buckets);
    setY(buckets);

    d3.select('#' + svgId).remove();
    vis = d3.select('#' + domId)
      .append("svg:svg")
        .attr("width", width)
        .attr("height", height)
        .attr("id", svgId);
    var xAxis = d3.svg.axis()
      .orient("bottom")
      .scale(xScale);
    vis.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + (height - padding) + ")")
      .call(xAxis);
  }

  function drawMovingAvg(buckets) {
    var lineFunction = d3.svg.line()
      .x(function(d) { return xScale(d.key); })
      .y(function(d) {
        var y = 0;
        if(d.seasonal_avg) y = d.seasonal_avg.value;
        return yScale(y);
      })
      .interpolate("linear");

    vis.append("path")
      .attr("class", "movingAvg")
      .attr("d", lineFunction(buckets));
  }

  return {
    draw : function(buckets) {
      initVis(buckets);
      vis.selectAll(".bar")
        .data(buckets)
        .enter().append("rect")
          .attr("class", "bar")
          .attr("x", function(d) { return xScale(d.key) - (barWidth/2); })
          .attr("width", barWidth)
          .attr("y", function(d) { return yScale(d.doc_count); })
          .attr("height", function(d) { return (height - padding) - yScale(d.doc_count); })
          .on("click", function() {
            d3.selectAll(".selectedBar")
              .attr("class", "bar")
            var selected = d3.select(this);
            selected.attr("class", "selectedBar");
            d3.event.stopPropagation();
            selectCallback(selected.data()[0].key);
          });
      drawMovingAvg(buckets);
    },
    onSelect : function(callback) {
      selectCallback = callback;
    }
  }
}