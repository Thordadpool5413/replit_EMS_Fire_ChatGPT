Source: https://developers.google.com/maps/documentation/routes
Title: Routes API  |  Google for Developers
Fetched: 2026-11-01T05:12:28.205Z

[Skip to main content](https://developers.google.com/maps/documentation/routes#main-content)

[![Google Maps Platform](https://www.gstatic.com/images/branding/productlogos/maps_2025/v1/192px.svg)](https://developers.google.com/maps)

- [**GoogleMaps Platform**](https://developers.google.com/maps)

`/`

Language

- [English](https://developers.google.com/maps/documentation/routes)
- [Deutsch](https://developers.google.com/maps/documentation/routes?hl=de)
- [Español](https://developers.google.com/maps/documentation/routes?hl=es)
- [Español – América Latina](https://developers.google.com/maps/documentation/routes?hl=es-419)
- [Français](https://developers.google.com/maps/documentation/routes?hl=fr)
- [Indonesia](https://developers.google.com/maps/documentation/routes?hl=id)
- [Italiano](https://developers.google.com/maps/documentation/routes?hl=it)
- [Polski](https://developers.google.com/maps/documentation/routes?hl=pl)
- [Português – Brasil](https://developers.google.com/maps/documentation/routes?hl=pt-br)
- [Tiếng Việt](https://developers.google.com/maps/documentation/routes?hl=vi)
- [Türkçe](https://developers.google.com/maps/documentation/routes?hl=tr)
- [Русский](https://developers.google.com/maps/documentation/routes?hl=ru)
- [עברית](https://developers.google.com/maps/documentation/routes?hl=he)
- [العربيّة](https://developers.google.com/maps/documentation/routes?hl=ar)
- [فارسی](https://developers.google.com/maps/documentation/routes?hl=fa)
- [हिंदी](https://developers.google.com/maps/documentation/routes?hl=hi)
- [বাংলা](https://developers.google.com/maps/documentation/routes?hl=bn)
- [ภาษาไทย](https://developers.google.com/maps/documentation/routes?hl=th)
- [中文 – 简体](https://developers.google.com/maps/documentation/routes?hl=zh-cn)
- [中文 – 繁體](https://developers.google.com/maps/documentation/routes?hl=zh-tw)
- [日本語](https://developers.google.com/maps/documentation/routes?hl=ja)
- [한국어](https://developers.google.com/maps/documentation/routes?hl=ko)

[Sign in](https://developers.google.com/_d/signin?continue=https%3A%2F%2Fdevelopers.google.com%2Fmaps%2Fdocumentation%2Froutes&prompt=select_account)

- [Routes API](https://developers.google.com/maps/documentation/routes)

Compute routes between locations and calculate route matrices for multiple combinations of origins and destinations with the Routes API.


[Get Started](https://console.cloud.google.com/google/maps-apis/start?utm_source=Docs_GS_Button&utm_content=Docs_routes) [Contact sales](https://mapsplatform.google.com/contact-us/)

- On this page
- [Features](https://developers.google.com/maps/documentation/routes#features)
- [Explore](https://developers.google.com/maps/documentation/routes#explore)
- [Help & support](https://developers.google.com/maps/documentation/routes#help-amp-support)

Join us for our next **Google Maps Platform Developer Community Day** in San Francisco in December! [Apply now](https://docs.google.com/forms/d/e/1FAIpQLScCs8135KThpXswHNX8KAsYEdCQqWTmXIFztIzkjzdW9AQ1Cw/viewform) to attend.


- [Home](https://developers.google.com/)
- [Products](https://developers.google.com/products)
- [Google Maps Platform](https://developers.google.com/maps)
- [Documentation](https://developers.google.com/maps/documentation)
- [Routes API](https://developers.google.com/maps/documentation/routes)



 Send feedback



- On this page
- [Features](https://developers.google.com/maps/documentation/routes#features)
- [Explore](https://developers.google.com/maps/documentation/routes#explore)
- [Help & support](https://developers.google.com/maps/documentation/routes#help-amp-support)

# Routes API    Stay organized with collections      Save and categorize content based on your preferences.

The Routes API service includes two methods:


**Compute Routes** returns the ideal route between two locations.


**Compute Route Matrix** returns route data for multiple combinations of origins and destinations.

[local\_shipping](https://developers.google.com/maps/documentation/routes/lvr)

### [Large vehicle routing](https://developers.google.com/maps/documentation/routes/lvr)

Route large vehicles such as trucks and buses while taking into account their weight, height, width, and length restrictions.



[moped](https://developers.google.com/maps/documentation/routes/route_two_wheel)

### [Route two-wheeled vehicles](https://developers.google.com/maps/documentation/routes/route_two_wheel)

Route two-wheeled motorized vehicles such as motorcycles. This routing feature differs from the bicycle travel mode, which is a human-powered travel mode.



[toll](https://developers.google.com/maps/documentation/routes/calculate_toll_fees)

### [Calculate toll fees](https://developers.google.com/maps/documentation/routes/calculate_toll_fees)

Compute the estimated toll fees for a route in the appropriate currency in select cities only.



[eco](https://developers.google.com/maps/documentation/routes/eco-routes)

### [Configure eco-friendly routes](https://developers.google.com/maps/documentation/routes/eco-routes)

Estimate an eco-friendly route showing the most fuel or energy efficient route based on your vehicle's engine type.



[polyline](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)

### [Request traffic information on the polyline](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)

Request information about traffic conditions along a traffic-aware polyline.



[traffic](https://developers.google.com/maps/documentation/routes/config_trade_offs)

### [Configure traffic data quality vs latency](https://developers.google.com/maps/documentation/routes/config_trade_offs)

Get a routing preference to control the trade-off between accurate, traffic-aware routes and faster response times.



[stream](https://developers.google.com/maps/documentation/routes/compute_route_matrix#stream_results)

### [Stream results from Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix\#stream_results)

Return results as they're available for faster latency.



[pin\_drop](https://developers.google.com/maps/documentation/routes/stop_over)

### [Use the vehicle stopover qualifier](https://developers.google.com/maps/documentation/routes/stop_over)

Specify whether a waypoint can be used by a vehicle as a pickup or drop-off stop.



* * *

[![](https://developers.google.com/static/maps/images/landing/hero_directions_api.png)](https://developers.google.com/maps/demo-key)

### [Compute Routes](https://developers.google.com/maps/demo-key)

Provide directions with real-time traffic for transit, biking, driving, 2-wheel motorized vehicles, or walking between multiple locations.

Get started with a Maps Demo Key at no cost.



[Get a Demo Key](https://developers.google.com/maps/demo-key) [Learn more](https://developers.google.com/maps/documentation/routes/compute-route-over) [Try the demo](https://developers.google.com/maps/documentation/routes/demo) [Set up Compute Routes](https://developers.google.com/maps/documentation/routes/cloud-setup) [Get a route](https://developers.google.com/maps/documentation/routes/compute_route_directions)

[![](https://developers.google.com/static/maps/images/landing/hero_distance_matrix_api.png)](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over)

### [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over)

Calculate travel times and distances for a matrix of routes between different origin and destination locations for up to 625 route elements.



[Learn more](https://developers.google.com/maps/documentation/routes/compute-route-matrix-over) [Set up Compute Route Matrix](https://developers.google.com/maps/documentation/routes/cloud-setup) [Get a route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)

[![](https://developers.google.com/static/site-assets/logo-stack-overflow.svg)](https://stackoverflow.com/questions/tagged/google-routes-api)

### [Stack Overflow](https://stackoverflow.com/questions/tagged/google-routes-api)

Get help. Give Help. Build Maps karma.

[![](https://developers.google.com/static/maps/images/landing/buganizer.svg)](https://issuetracker.google.com/issues/new?component=1244012)

### [Issue Tracker](https://issuetracker.google.com/issues/new?component=1244012)

Report a bug or open a feature request.

[![](https://developers.google.com/static/maps/images/landing/warning.svg)](https://status.cloud.google.com/maps-platform/)

### [Platform status](https://status.cloud.google.com/maps-platform/)

Find out about platform incidents and outages.

[![](https://developers.google.com/static/maps/images/landing/help.svg)](https://developers.google.com/maps/documentation/routes/support)

### [Support](https://developers.google.com/maps/documentation/routes/support)

Get help from the Google Maps Platform team.

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-10-27 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-10-27 UTC."\],\[\],\[\]\]



Info


Chat


API


## Page info

bug\_reportfullscreenclose\_fullscreenclose

### On this page

- On this page
- [Features](https://developers.google.com/maps/documentation/routes#features)
- [Explore](https://developers.google.com/maps/documentation/routes#explore)
- [Help & support](https://developers.google.com/maps/documentation/routes#help-amp-support)