Source: https://developers.google.com/maps/documentation/places/web-service/overview
Title: Overview  |  Places API (New)  |  Google for Developers
Fetched: 2026-11-01T05:12:26.143Z

[Skip to main content](https://developers.google.com/maps/documentation/places/web-service/overview#main-content)

[![Google Maps Platform](https://www.gstatic.com/images/branding/productlogos/maps_2025/v1/192px.svg)](https://developers.google.com/maps)

- [GoogleMaps Platform](https://developers.google.com/maps)

`/`

Language

- [English](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Deutsch](https://developers.google.com/maps/documentation/places/web-service/overview?hl=de)
- [Español](https://developers.google.com/maps/documentation/places/web-service/overview?hl=es)
- [Español – América Latina](https://developers.google.com/maps/documentation/places/web-service/overview?hl=es-419)
- [Français](https://developers.google.com/maps/documentation/places/web-service/overview?hl=fr)
- [Indonesia](https://developers.google.com/maps/documentation/places/web-service/overview?hl=id)
- [Italiano](https://developers.google.com/maps/documentation/places/web-service/overview?hl=it)
- [Polski](https://developers.google.com/maps/documentation/places/web-service/overview?hl=pl)
- [Português – Brasil](https://developers.google.com/maps/documentation/places/web-service/overview?hl=pt-br)
- [Tiếng Việt](https://developers.google.com/maps/documentation/places/web-service/overview?hl=vi)
- [Türkçe](https://developers.google.com/maps/documentation/places/web-service/overview?hl=tr)
- [Русский](https://developers.google.com/maps/documentation/places/web-service/overview?hl=ru)
- [עברית](https://developers.google.com/maps/documentation/places/web-service/overview?hl=he)
- [العربيّة](https://developers.google.com/maps/documentation/places/web-service/overview?hl=ar)
- [فارسی](https://developers.google.com/maps/documentation/places/web-service/overview?hl=fa)
- [हिंदी](https://developers.google.com/maps/documentation/places/web-service/overview?hl=hi)
- [বাংলা](https://developers.google.com/maps/documentation/places/web-service/overview?hl=bn)
- [ภาษาไทย](https://developers.google.com/maps/documentation/places/web-service/overview?hl=th)
- [中文 – 简体](https://developers.google.com/maps/documentation/places/web-service/overview?hl=zh-cn)
- [中文 – 繁體](https://developers.google.com/maps/documentation/places/web-service/overview?hl=zh-tw)
- [日本語](https://developers.google.com/maps/documentation/places/web-service/overview?hl=ja)
- [한국어](https://developers.google.com/maps/documentation/places/web-service/overview?hl=ko)

[Sign in](https://developers.google.com/_d/signin?continue=https%3A%2F%2Fdevelopers.google.com%2Fmaps%2Fdocumentation%2Fplaces%2Fweb-service%2Foverview&prompt=select_account)

- [Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview)

[Get Started](https://console.cloud.google.com/google/maps-apis/start?utm_source=Docs_GS_Button&ref=https://developers.google.com/maps/&utm_content=Docs_places_backend) [Contact sales](https://mapsplatform.google.com/contact-us/)

- On this page
- [Introduction](https://developers.google.com/maps/documentation/places/web-service/overview#introduction)
- [Why use the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#why-use)
- [What can you do with the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#what-can-you-do)
- [How the Places API (New) works](https://developers.google.com/maps/documentation/places/web-service/overview#how-works)
- [How to use the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#how-use)

Join us for our next **Google Maps Platform Developer Community Day** in San Francisco in December! [Apply now](https://docs.google.com/forms/d/e/1FAIpQLScCs8135KThpXswHNX8KAsYEdCQqWTmXIFztIzkjzdW9AQ1Cw/viewform) to attend.


- [Home](https://developers.google.com/)
- [Products](https://developers.google.com/products)
- [Google Maps Platform](https://developers.google.com/maps)
- [Documentation](https://developers.google.com/maps/documentation)
- [Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Guides](https://developers.google.com/maps/documentation/places/web-service)



 Send feedback



# Overview    Stay organized with collections      Save and categorize content based on your preferences.

- On this page
- [Introduction](https://developers.google.com/maps/documentation/places/web-service/overview#introduction)
- [Why use the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#why-use)
- [What can you do with the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#what-can-you-do)
- [How the Places API (New) works](https://developers.google.com/maps/documentation/places/web-service/overview#how-works)
- [How to use the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview#how-use)

![Spark icon](https://developers.google.com/_static/images/icons/spark.svg)

## Page Summary

outlined\_flag

- The Places API provides location data and imagery for establishments, geographic locations, and points of interest through various methods.

- You can use the Places API to create location-aware features, such as place search, autocomplete, details retrieval, and photo integration.

- The Places API offers two versions: Places API and Places API (New), with differences outlined in a guide for choosing the best fit for your project.

- You can access places data through requests to specific service endpoints using an API key or OAuth token, receiving responses in JSON or XML format.

- Detailed steps for using the API include setup, text search, place details retrieval using place IDs, and accessing place photos.


Select platform: [Android](https://developers.google.com/maps/documentation/places/android-sdk/overview "View this page for the Android platform docs.") [iOS](https://developers.google.com/maps/documentation/places/ios-sdk/overview "View this page for the iOS platform docs.") [JavaScript](https://developers.google.com/maps/documentation/javascript/place "View this page for the JavaScript platform docs.") [Web Service](https://developers.google.com/maps/documentation/places/web-service/overview "View this page for the Web Service platform docs.")

**European Economic Area (EEA) developers**

## Introduction

The Places API is a service that accepts HTTP requests for location
data through a variety of methods. It returns formatted location data
and imagery about establishments, geographic locations, or prominent
points of interest.

## Why use the Places API (New)

Create location-aware features to make detailed location data
available to your users. The data available through the
Places API (New) is built on one of the most accurate, up-to-date,
and comprehensive place models of the real world. Here are example use
cases for applications:

- Display condo rentals within major metropolitan areas with results
targeted specifically to cities.
- Include place details in a pickup or delivery status update.
- Display a list of parks in an area along with user-submitted
photos and reviews.
- Provide people planning trips with contact information, reviews,
and price levels for establishments along the way.

## What can you do with the Places API (New)

You can use the Places API (New) to include the following features
in your applications:

- Provide place search results from different types of users queries,
such as text input, nearby locations, and ambiguous or categorical
user queries.
- Enable autocomplete features for different search types, either
specific text queries or categorical queries.

- Refine the type of details returned about a place, such as
operating hours, a summary, user reviews, and a photo.

- Add high-quality photos to locations served by your application.

Many Google Maps Platform APIs support [place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id), where
the place ID uniquely identifies a place in the Google Places database and
on Google Maps. There are many ways to obtain a place ID, including from
the Places API (New), but also from the [Geocoding API](https://developers.google.com/maps/documentation/geocoding), [Routes API](https://developers.google.com/maps/documentation/routes), and [Address Validation API](https://developers.google.com/maps/documentation/address-validation).

Once you have a place ID, you can use the Places API (New) to
request more details about a particular establishment or point of
interest, such as its complete address, phone number, user rating, and
reviews.

## How the Places API (New) works

Places API (New) accepts requests as a standard URL with a
specific service endpoint, such as `/places` or
`places:searchText` and returns a JSON response.
Places API (New) supports authorization by API key and OAuth token.
The following example makes a Place Details (New) request to return
the address components for a place ID using an API key:

```
https://places.googleapis.com/v1/places/GyuEmsRBfy61i59si0?fields=addressComponents&key=YOUR_API_KEY
```

## How to use the Places API (New)

The steps below cover a typical use case scenario for using the Places
API service. As you build out your solution, you can use additional
endpoints, such as Nearby Search (New) and Place Photos (New).

|     |     |     |
| --- | --- | --- |
| 1 | **Get set up** | [Set up](https://developers.google.com/maps/documentation/places/web-service/get-api-key) billing, enable<br> Places API (New), and make your first request. |
| 2 | **Try a basic text search** | Issue a text search by using [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search). |
| 3 | **Use the place ID for more details** | Many Google Maps Platform APIs return a place ID as part of a<br> response. Use place IDs to get [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details). |
| 4 | **Get a photo for a place** | Place Photos (New) gives you access to the millions of<br> photos stored in the Places database. Use [Place Photos (New)](https://developers.google.com/maps/documentation/places/web-service/place-photos) to<br> access photos for a place. |



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-10-30 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-10-30 UTC."\],\[\],\[\]\]



Info


Chat


API