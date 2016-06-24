Set of GUIs to help visualize results of ElasticSearch pipeline aggregations.

## Enable CORs
CORS is required since the html file will have a different domain than elasticsearch. Update elasticsearch.yml with the following parameters. Then restart elasticsearch.
```
http.cors.enabled: true
http.cors.allow-origin: '*'
http.cors.allow-methods : OPTIONS, HEAD, GET, POST, PUT, DELETE
http.cors.allow-headers : X-Requested-With,X-Auth-Token,Content-Type, Content-Length
```
