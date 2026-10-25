---
title: Using the Fetch API (MDN Web Docs)
language: en
genre: documentation
source: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
license: CC BY-SA 2.5
---
The Fetch API provides a JavaScript interface for making HTTP requests and processing the responses.

Fetch is the modern replacement for XMLHttpRequest: unlike XMLHttpRequest, which uses callbacks, Fetch is promise-based and is integrated with features of the modern web such as service workers and Cross-Origin Resource Sharing (CORS).

With the Fetch API, you make a request by calling fetch(), which is available as a global function in both window and worker contexts. You pass it a Request object or a string containing the URL to fetch, along with an optional argument to configure the request.

The fetch() function returns a Promise which is fulfilled with a Response object representing the server's response. You can then check the request status and extract the body of the response in various formats, including text and JSON, by calling the appropriate method on the response.

const result = await response.json(); console.log(result); } catch (error) { console.error(error.message); } } 

The fetch() function will reject the promise on some errors, but not if the server responds with an error status like 404: so we also check the response status and throw if it is not OK.

Otherwise, we fetch the response body content as JSON by calling the json() method of Response, and log one of its values. Note that like fetch() itself, json() is asynchronous, as are all the other methods to access the response body content.
