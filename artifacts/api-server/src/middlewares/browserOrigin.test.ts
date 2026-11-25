import assert from "node:assert/strict";
import test from "node:test";
import { allowedBrowserOrigin, sameOriginRequest } from "./browserOrigin";
test("only exact configured origin is accepted, never arbitrary reflection",()=>{
 const origin="https://atlas.example";
 assert.equal(allowedBrowserOrigin(origin,"internal:3000",origin),true);
 assert.equal(allowedBrowserOrigin("https://other.example","other.example",origin),false);
 assert.equal(allowedBrowserOrigin("http://atlas.example","atlas.example",origin),false);
 assert.equal(allowedBrowserOrigin(origin,"atlas.example","invalid"),false);
 assert.equal(allowedBrowserOrigin(origin+"/path","atlas.example",origin),false);
 assert.equal(allowedBrowserOrigin("null","atlas.example",origin),false);
 assert.equal(allowedBrowserOrigin(origin,"internal:3000",origin+"/"),true);
});
test("unconfigured fallback ignores forwarded host and rejects cross-site or malformed requests",()=>{
 assert.equal(sameOriginRequest({host:"atlas.example",origin:"https://atlas.example","sec-fetch-site":"same-origin"},""),true);
 assert.equal(sameOriginRequest({host:"internal:3000",origin:"https://evil.example","x-forwarded-host":"evil.example"},""),false);
 assert.equal(sameOriginRequest({host:"atlas.example","sec-fetch-site":"cross-site"},""),false);
 assert.equal(sameOriginRequest({host:"atlas.example",origin:"https://atlas.example","sec-fetch-site":"same-site"},""),false);
 assert.equal(sameOriginRequest({host:"atlas.example"},""),true);
 assert.equal(sameOriginRequest({host:"atlas.example",origin:"https://atlas.example@evil.example"},""),false);
});
