Collection of web pages to visualize results of ElasticSearch pipeline aggregations. The goal is to provide a sand box for rapid prototypting to determine which pipeline aggregations are useful and how to arrange the visualizations to convey meaning.

## Enable CORs
CORS is required since the html file will have a different domain than elasticsearch. Update elasticsearch.yml with the following parameters. Then restart elasticsearch.
```
http.cors.enabled: true
http.cors.allow-origin: '*'
http.cors.allow-methods : OPTIONS, HEAD, GET, POST, PUT, DELETE
http.cors.allow-headers : X-Requested-With,X-Auth-Token,Content-Type, Content-Length
```

## Detecting Geo-Temporal anomalies
Visualization inspired by the [blog post](http://www.front2backdev.com/2016/05/03/geo-temporal-anomaly/) that utilizes a moving average aggregation on the results of a date_histogram aggregation nested within a geohash_grid aggreagation.

Open **map.html** in a modern browser and follow the on screen instructions.

A timeline displays the date histogram with an overlaid line displaying the moving average. Users can select a date bucket to geospatially investigate how the data is distributed and how the geographic data distribution deviates from the moving average(baseline). Two maps are presented to the user. The map on the left displays the geographic distribution of the events for the selected date bucket. The map on the right displays the deviation from the moving average. 
