Source: https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview
Title: Overview  |  Maps JavaScript API  |  Google for Developers
Fetched: 2026-11-01T05:12:31.515Z

[Skip to main content](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#main-content)

[![Google Maps Platform](https://www.gstatic.com/images/branding/productlogos/maps_2025/v1/192px.svg)](https://developers.google.com/maps)

- [GoogleMaps Platform](https://developers.google.com/maps)

`/`

Language

- [English](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview)
- [Deutsch](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=de)
- [Español](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=es)
- [Español – América Latina](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=es-419)
- [Français](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=fr)
- [Indonesia](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=id)
- [Italiano](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=it)
- [Polski](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=pl)
- [Português – Brasil](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=pt-br)
- [Tiếng Việt](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=vi)
- [Türkçe](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=tr)
- [Русский](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=ru)
- [עברית](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=he)
- [العربيّة](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=ar)
- [فارسی](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=fa)
- [हिंदी](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=hi)
- [বাংলা](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=bn)
- [ภาษาไทย](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=th)
- [中文 – 简体](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=zh-cn)
- [中文 – 繁體](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=zh-tw)
- [日本語](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=ja)
- [한국어](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview?hl=ko)

Sign in

- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)

[Get Started](https://console.cloud.google.com/google/maps-apis/start?utm_source=Docs_GS_Button&ref=https://developers.google.com/maps/&utm_content=Docs_maps-backend) [Contact sales](https://mapsplatform.google.com/contact-us/)

- On this page
- [Feature types](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#feature_types)
- [Style boundary polygons](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#style_boundary_polygons)
- [Next steps](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#next_steps)

reviews **[Get a Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key):** Try out select Maps JavaScript API and Places UI Kit features at no cost with a Maps Demo Key—no billing information required.


- [Home](https://developers.google.com/)
- [Products](https://developers.google.com/products)
- [Google Maps Platform](https://developers.google.com/maps)
- [Documentation](https://developers.google.com/maps/documentation)
- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)



 Send feedback



# Overview    Stay organized with collections      Save and categorize content based on your preferences.

- On this page
- [Feature types](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#feature_types)
- [Style boundary polygons](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#style_boundary_polygons)
- [Next steps](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview#next_steps)

![Spark icon](https://developers.google.com/_static/images/icons/spark.svg)

## Page Summary

outlined\_flag

- Data-driven styling for boundaries allows you to style Google's administrative boundary polygons and combine them with your own data to create customized maps, such as choropleth maps.

- You can target specific regions using place IDs and apply custom styling to boundary polygons based on feature types like country, state, locality, and postal code.

- Boundary coverage varies by country and feature type, allowing you to style polygons with fill and stroke properties for visualization.

- To get started, configure your map style, obtain place IDs for regions, and explore advanced features like creating choropleth maps and handling mouse events.

- Refer to the Google boundaries coverage documentation to understand the availability of feature types for different countries.


Select platform: [Android](https://developers.google.com/maps/documentation/android-sdk/dds-boundaries/overview "View this page for the Android platform docs.") [iOS](https://developers.google.com/maps/documentation/ios-sdk/dds-boundaries/overview "View this page for the iOS platform docs.") [JavaScript](https://developers.google.com/maps/documentation/javascript/dds-boundaries/overview "View this page for the JavaScript platform docs.")

Data-driven styling for boundaries lets you access Google's polygons for
administrative boundaries, apply styling to boundary polygons,
display them on your maps, and combine your own business data to create rich,
customized choropleth maps.

Data-driven styling for boundaries lets you target regions by place ID, and apply
custom styling to boundary polygons on the map. Each feature type represents a
type of region; you select which feature types to enable when [configuring a map style](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start).

Consult [Google boundaries coverage](https://developers.google.com/maps/documentation/javascript/dds-boundaries/coverage)
to see per-country boundary coverage.

## Feature types

Data-driven styling provides access to Google boundaries for feature types that
represent administrative areas. Administrative areas are categorized by
function, for example country, state, locality, and postal code. Feature types
are arranged by administrative level, the structure of which varies by country.
The following feature types are supported:

- `COUNTRY` — The national political entity, typically the highest
order type.
- `ADMINISTRATIVE_AREA_LEVEL_1` — A first-order civil entity below
the country level. Within the United States, these administrative levels
are states.
- `ADMINISTRATIVE_AREA_LEVEL_2` — A second-order civil entity
below the country level. Within the United States, these administrative
levels are counties.
- `LOCALITY` — An incorporated city or town political entity.
- `POSTAL_CODE` — A postal code, as used to address postal mail within
the country.
- `SCHOOL_DISTRICT` — A school district; includes unified, elementary, and
secondary.

Administrative areas are represented on the map as feature layers; each type
has its own layer. Feature layers are enabled per map style. You can choose
which feature layers to enable when [setting up your map style in the Google Cloud console](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start).

## Style boundary polygons

You can apply styles to boundary polygons for fill (color, opacity), and stroke
(color, opacity, stroke weight). Use styling to:

- [Style a boundary polygon](https://developers.google.com/maps/documentation/javascript/dds-boundaries/style-polygon)
or show all the boundaries for a feature type.
- [Create a choropleth map](https://developers.google.com/maps/documentation/javascript/dds-boundaries/choropleth-map)
by joining your own business data.

[Google boundaries coverage](https://developers.google.com/maps/documentation/javascript/dds-boundaries/coverage)
shows per-country availability of feature types.

## Next steps

- [Get started with data-driven styling for boundaries](https://developers.google.com/maps/documentation/javascript/dds-boundaries/start)
- [Get a place ID for a region](https://developers.google.com/maps/documentation/javascript/dds-boundaries/dds-use-maps-places-apis#use_to_find_a_region)
- [Use the Geocoding and Places APIs with data-driven styling for boundaries](https://developers.google.com/maps/documentation/javascript/dds-boundaries/dds-use-maps-places-apis)
- [Style a boundary polygon](https://developers.google.com/maps/documentation/javascript/dds-boundaries/style-polygon)
- [Make a choropleth map](https://developers.google.com/maps/documentation/javascript/dds-boundaries/choropleth-map)
- [Handle mouse events](https://developers.google.com/maps/documentation/javascript/dds-boundaries/handle-events)



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-10-30 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-10-30 UTC."\],\[\],\[\]\]



Info


Chat


API