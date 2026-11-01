Source: https://developers.google.com/maps/documentation/geocoding/overview
Title: Geocoding API overview  |  Google for Developers
Fetched: 2026-11-01T05:15:06.030Z

[Skip to main content](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#main-content)

[![Google Maps Platform](https://www.gstatic.com/images/branding/productlogos/maps_2025/v1/192px.svg)](https://developers.google.com/maps)

- [GoogleMaps Platform](https://developers.google.com/maps)

`/`

Language

- [English](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview)
- [Deutsch](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=de)
- [Español](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=es)
- [Español – América Latina](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=es-419)
- [Français](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=fr)
- [Indonesia](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=id)
- [Italiano](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=it)
- [Polski](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=pl)
- [Português – Brasil](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=pt-br)
- [Tiếng Việt](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=vi)
- [Türkçe](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=tr)
- [Русский](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=ru)
- [עברית](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=he)
- [العربيّة](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=ar)
- [فارسی](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=fa)
- [हिंदी](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=hi)
- [বাংলা](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=bn)
- [ภาษาไทย](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=th)
- [中文 – 简体](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=zh-cn)
- [中文 – 繁體](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=zh-tw)
- [日本語](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=ja)
- [한국어](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview?hl=ko)

[Sign in](https://developers.google.com/_d/signin?continue=https%3A%2F%2Fdevelopers.google.com%2Fmaps%2Fdocumentation%2Fgeocoding%2Fguides-v3%2Foverview&prompt=select_account)

- [Geocoding API](https://developers.google.com/maps/documentation/geocoding)

[Get Started](https://console.cloud.google.com/google/maps-apis/start?utm_source=Docs_GS_Button&ref=https://developers.google.com/maps/&utm_content=Docs_geocoding-backend) [Contact sales](https://mapsplatform.google.com/contact-us/)

- On this page
- [What you can do with the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#what-you-can-do-with-geocoding)
- [How the Geocoding API works](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-geocoding-works)
  - [Resources](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#resources)
- [How to use the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-to-use)
  - [Available client libraries](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#available-client-libraries)
- [What's next](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#whats-next)

Version 4 of the Geocoding API is generally available. To migrate to v4, see the [v3 to v4 Migration guide](https://developers.google.com/maps/documentation/geocoding/geocoding-v4-migrate).


- [Home](https://developers.google.com/)
- [Products](https://developers.google.com/products)
- [Google Maps Platform](https://developers.google.com/maps)
- [Documentation](https://developers.google.com/maps/documentation)
- [Geocoding API](https://developers.google.com/maps/documentation/geocoding)
- [Developer Guides v3](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview)

Was this helpful?



 Send feedback



# Geocoding API overview    Stay organized with collections      Save and categorize content based on your preferences.

- On this page
- [What you can do with the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#what-you-can-do-with-geocoding)
- [How the Geocoding API works](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-geocoding-works)
  - [Resources](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#resources)
- [How to use the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-to-use)
  - [Available client libraries](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#available-client-libraries)
- [What's next](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#whats-next)

**European Economic Area (EEA) developers**

How to convert addresses to map coordinates with Geocoding API - YouTube

Tap to unmute

[How to convert addresses to map coordinates with Geocoding API](https://www.youtube.com/watch?v=2IIhGA1cfmc) [Google Maps Platform](https://www.youtube.com/channel/UCVhDYDVo3AqyMIKtMLSrcEg)

Google Maps Platform48.9K subscribers

[Watch on](https://www.youtube.com/watch?v=2IIhGA1cfmc)

The Geocoding API is a service that accepts a place as an
address, latitude and longitude coordinates, or Place ID. It converts the
address into latitude and longitude coordinates and a Place ID, or converts
latitude and longitude coordinates or a Place ID into an address.

## What you can do with the Geocoding API

You can use the Geocoding API to obtain geocoding data for one or more addresses or
places, including the following:

- Geographic coordinates for addresses.
- Addresses for sets of latitude and longitude coordinates.
- Addresses for place IDs.

You can control where the results appear and constrain the results to a particular region,
county, or postal code.

## How the Geocoding API works

The Geocoding API does both geocoding and reverse geocoding:

- [**Geocoding**](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding): Converts addresses such as
"1600 Amphitheatre Parkway, Mountain View, CA" into latitude and longitude coordinates or Place
IDs. You can use these coordinates to place markers on a map, or to center or reposition the map
within the view frame.
- [**Reverse geocoding**](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-reverse-geocoding): Converts
latitude/longitude coordinates or a Place ID into a human-readable address. You can use
addresses for a variety of scenarios, including deliveries or pickups.

The following demo uses the Geocoding Service through the Maps JavaScript API
to demonstrate how the Geocoding API works. Open the map in a separate tab
to see more options and details.

Google for DevelopersGoogle Maps API Geocoder Tool

|     |     |
| --- | --- |
| ![](https://developers-dot-devsite-v2-prod.appspot.com/maps/documentation/utils/geocoder) | **Partial match**

**Address:**

**Location:**

**Types:**

**Postcode localities:**

Address components:

|
|

**Bounds:**

**Viewport:** |

### Resources

The following table summarizes the resources available through the
Geocoding API along with the data each method returns.

| Data resources | Data returned | Return format |
| --- | --- | --- |
| [Geocoding](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding) | Returns address, address components, and address types. See<br> [Results](https://developers.google.com/maps/documentation/geocoding/requests-geocoding#results)<br> in the _Geocoding request and response_ guide. | - JSON<br>- XML |
| [Reverse geocoding](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-reverse-geocoding) | Returns address, address components, and address types. See<br> [Reverse geocoding responses](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding#reverse-response)<br> in the Reverse geocoding request and response guide. |
| [Place geocoding](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-places-geocoding) | Returns address, address components, and address types. See<br> [Reverse geocoding responses](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-places-geocoding)<br> in the Place geocoding request and response guide. |

## How to use the Geocoding API

|     |     |     |
| --- | --- | --- |
| 1 | **Get set up.** | Start with [Set up your\<br> Google Cloud project](https://developers.google.com/maps/documentation/geocoding/cloud-setup)<br> and complete the setup<br> instructions that follow. |
| 2 | **Try a geocoding request** | Once you have an API key, you can start testing out the Geocoding API directly from<br> curl or a browser. You'll need to supply the correct lookup parameters<br> for address or component lookups. See<br> [Geocoding parameters](https://developers.google.com/maps/documentation/geocoding/requests-geocoding#geocoding-lookup)<br> for details. |
| 3 | **Try a reverse geocoding request** | Supply latitude/longitude coordinates along with your API key to obtain<br> address components for the closest human-readable address for that location.<br> See [Reverse geocoding requests](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding#reverse-requests)<br> for details. |
| 4 | **Understand response basics** | All methods in the Geocoding API return the same data in either JSON or XML.<br> See<br> [Geocoding responses](https://developers.google.com/maps/documentation/geocoding/requests-geocoding#GeocodingResponses)<br> for an explanation of the data, status codes, and error messages. |
| 5 | **Incorporate geocoding data into your own app!** | You can use geocoding data to obtain addresses from map markers<br> or to supply markers on a map based on a known address. |

### Available client libraries

Call this API in the language of
your choice through one of the following client libraries:

- [Java\\
Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-java)
- [Python\\
Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-python)
- [Go Client\\
for Google Maps Services](https://github.com/googlemaps/google-maps-services-go)
- [Node.js\\
Client for Google Maps Services](https://github.com/googlemaps/google-maps-services-js)

The Java Client, Python Client, Go Client and Node.js Client for Google Maps
Services are community-supported client libraries, open sourced under the
[Apache 2.0 License](http://www.apache.org/licenses/LICENSE-2.0).
Download them from GitHub, where you can also find installation instructions and sample code.

## What's next

- **Start using the Geocoding API**: Go to
[Set up your\\
Google Cloud project](https://developers.google.com/maps/documentation/geocoding/cloud-setup).
- **Get started with sample requests and responses**: Go to
[Geocoding requests and responses](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding)
- **Follow best practices**: Go to [Geocoding Addresses Best\\
Practices](https://developers.google.com/maps/documentation/geocoding/best-practices).

Was this helpful?



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-10-30 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-10-30 UTC."\],\[\],\[\]\]



Info


Chat


API


## Page info

bug\_reportfullscreenclose\_fullscreenclose

### On this page

- On this page
- [What you can do with the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#what-you-can-do-with-geocoding)
- [How the Geocoding API works](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-geocoding-works)
  - [Resources](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#resources)
- [How to use the Geocoding API](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#how-to-use)
  - [Available client libraries](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#available-client-libraries)
- [What's next](https://developers.google.com/maps/documentation/geocoding/guides-v3/overview#whats-next)