createTimeline = function(domId) {
  var xScale;
  var barWidth;
  var yScale;
  var vis;
  var width = 100;
  var height = 100;
  var leftMargin = 45;
  var padding = 20;
  const SVG_ID = "svg_" + domId;

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
      .range([leftMargin, width]);
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

  function clear() {
    d3.select('#' + SVG_ID).remove();
  }

  function initVis(buckets) {
    width = document.getElementById(domId).offsetWidth;
    height = document.getElementById(domId).offsetHeight;
    setX(buckets);
    setY(buckets);

    clear();
    vis = d3.select('#' + domId)
      .append("svg:svg")
        .attr("width", width)
        .attr("height", height)
        .attr("id", SVG_ID);

    var xAxis = d3.svg.axis()
      .orient("bottom")
      .scale(xScale);
    vis.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + (height - padding) + ")")
      .call(xAxis);

    var yAxis = d3.svg.axis()
      .scale(yScale)
      .orient("left")
      .ticks(5);
    vis.append("g")
      .attr("class", "y axis")
      .attr("transform", "translate(" + leftMargin + ",0)")
      .call(yAxis);

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

  function makeId(key) {
    return "date_histo_bucket_" + key;
  }

  return {
    clear : function() {
      clear();
    },
    draw : function(buckets) {
      initVis(buckets);
      vis.selectAll(".bar")
        .data(buckets)
        .enter().append("rect")
          .attr("class", "bar")
          .attr("id", function(d) {return makeId(d.key);})
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
    },
    selectBucket : function(bucketKey) {
      var event = document.createEvent("SVGEvents");
      event.initEvent("click",true,true);
      var selection = d3.select('#' + makeId(bucketKey));
      selection[0][0].dispatchEvent(event);
    }
  }
}