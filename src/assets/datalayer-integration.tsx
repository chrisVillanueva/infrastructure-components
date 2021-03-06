declare global {
    interface Window {
        __APOLLO_STATE__: any;
        __GRAPHQL__: any;
        __SCHEMA__: any;
    }
}

import * as React from 'react';

import { InMemoryCache } from "apollo-cache-inmemory";
import { createHttpLink } from 'apollo-link-http';
import {ApolloProvider, ApolloConsumer, getDataFromTree} from "react-apollo";

import ApolloClient from 'apollo-client';
//import { ApolloLink } from 'apollo-link';

import { SchemaLink } from 'apollo-link-schema';

//import fetch from 'node-fetch';
require('es6-promise').polyfill();
import 'isomorphic-fetch';


/**
 * we MUST NOT IMPORT CONTEXTs directly, but require them at time of use generally from Infrastructure-Components
 * because this then resolves to node_modules
 */

//import AttachDataLayer from './attach-data-layer';

import Types from '../types';
import { extractObject, INFRASTRUCTURE_MODES, loadConfigurationFromModule } from '../libs/loader';


/**
 *
 */
export const createServerSideClient = (link) => new ApolloClient({
    //ssrMode: true,
    // Remember that this is the interface the SSR server will use to connect to the
    // API server, so we need to ensure it isn't firewalled, etc
    link:link,
    cache: new InMemoryCache(),

});


/**
 * Puts the preloaded state in a string that can be put into a <script>-tag
 * Also puts the path to the GraphQL-Endpoint there
 *
 * @param preloadedState the state
 */

// here, we can also add stringified (json) data about the dataLayer, e.g. Schema
// it works without ... window.__SCHEMA__ = \`${schema}\`
export const importEnvironmentVariables = (preloadedState, url) => {
    //console.log("graphql-url: ", url);
    return `window.__APOLLO_STATE__ = ${JSON.stringify(preloadedState).replace(/</g, '\\\u003c')};
window.__GRAPHQL__ = "${url}"`;

}



/**
 * Function to be used on the client side to connect the client app with the dehydrated state from the server
 * to be rehydrated on the client
 *
 * Note: Queries and Mutations work with POST-requests, if you want query requests to work with GET,
 * set `useGETForQueries` to true. Mutations always use POST
 *
 * @param app the ReactApp to connect with the DataLayer
 */
export const hydrateFromDataLayer = (app, dataLayer) => {

    const AttachDataLayer = require("infrastructure-components").AttachDataLayer;
    //console.log("hydration, dataLayer: ", dataLayer);

    var preloadedState = {};
    if (typeof window != 'undefined' && window.__APOLLO_STATE__) {
        preloadedState = window.__APOLLO_STATE__;
        delete window.__APOLLO_STATE__;
    }

    //console.log("uri: ", window.__GRAPHQL__);

    const client = new ApolloClient({
        cache: new InMemoryCache().restore(preloadedState),
        link: createHttpLink({
            uri: window.__GRAPHQL__,
            credentials: 'include',
        })
    });

    //console.log("local client: ", client);

    return <ApolloProvider client={ client } >
        <ApolloConsumer>
            {client => <AttachDataLayer apolloClient={client} dataLayer={dataLayer}>{app}</AttachDataLayer>}
        </ApolloConsumer>

    </ApolloProvider>
};

/**
 *  function to be used to provide the data-layer to a single-page-app-client (esp. SOA!)
 */
export const renderFromDataLayer = (app, dataLayer) => {
    const AttachDataLayer = require("infrastructure-components").AttachDataLayer;
    //console.log("connect, dataLayer: ", dataLayer);



    //console.log("uri: ", window.__GRAPHQL__);

    const client = new ApolloClient({
        cache: new InMemoryCache(),
        link: createHttpLink(Object.assign({
            uri: window.__GRAPHQL__,

            /*credentials: 'include',
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                'Access-Control-Allow-Headers': 'application/json, Content-Type,token'
            }*/
        },
            /*window.__GRAPHQL__.indexOf("localhost") > 0 ? {fetchOptions: {
                mode: "no-cors",
            }} : {}*/
        ))
    });

    //console.log("local client: ", client);


    return <ApolloProvider client={ client } >
        <ApolloConsumer>
            {client => <AttachDataLayer apolloClient={client} dataLayer={dataLayer}>{app}</AttachDataLayer>}
        </ApolloConsumer>

    </ApolloProvider>

}

export const createApolloClient = (dataLayer, graphqlUrl, request) => {
    //console.log("STAGE_PATH: ", process.env.STAGE_PATH);
    //console.log("DOMAIN_ENABLED: ", process.env.DOMAIN_ENABLED);

    // TODO take these variables, esp. GraphQl-Path from the component rather than from the env-variables,
    // because, there might be more than one DataLayers!
    // when we have a valid stage_path or a domain, e.g. https://xxxxxxxxxxx.execute-api.eu-west-1.amazonaws.com/dev/query',
    /*const graphqlUrl = (
     process.env.STAGE_PATH !== undefined && process.env.STAGE_PATH !== "undefined" && process.env.STAGE_PATH.length > 0
     ) || process.env.DOMAIN_ENABLED === "true" ?
     // then use the path
     (process.env.DOMAIN_ENABLED !== undefined && process.env.DOMAIN_ENABLED === "true" &&
     process.env.DOMAIN_NAME !== undefined && process.env.DOMAIN_NAME !== undefined ?
     "https://"+process.env.DOMAIN_NAME : process.env.DOMAIN_URL) + "/"+process.env.GRAPHQL_PATH :
     // else mock the endpoint - use the dev-endpoint
     "https://yfse1b9v0m.execute-api.eu-west-1.amazonaws.com/dev/query"; // undefined; //
     //
     // TODO set undefined or a Mock or the Dev-Address here

     */


    //console.log("graphqlUrl: ", graphqlUrl);
    //console.log("schema: ", schema);

    const client = new ApolloClient({
        ssrMode: true,

        //ssrForceFetchDelay: 100,
        cache: new InMemoryCache(),
        /* instead of the createHttpLink, we use SchemaLink({ schema }) to void network traffic, for both endpoints
         * implements [[UseSchemaLinkSpec]]
         *
         */
        link: new SchemaLink({
            schema: dataLayer.getSchema(true),
            context: {
                // when we have a userId, put it into the context so thatwe have it through ssr, too.
                userId: require("infrastructure-components").getUserId(request)
            }
        })
        /*link: createHttpLink({
         uri: graphqlUrl,
         fetch: awsGraphqlFetch,
         credentials: 'include',
         }),*/

    });

    //console.log("client: ", client);
    return client;


}

export const getGraphqlUrl = (isOffline) => {
    // does not work offline, but does not need to!
    //console.log("Domain: ", process.env.DOMAIN_URL)

    // TODO this should not be hard-coded - see SOA plugin!
    return isOffline?  "http://localhost:3000/query" : process.env.DOMAIN_URL + "/"+process.env.GRAPHQL_PATH;
}


/**
 * Function to be used on server side that connects a ReactApp (jsx) with a GraphQL-Layer hosted on AWS Lambda/DynamoDb
 * Creates the server side store
 *
 * Fetch-library is required , see [this](https://github.com/apollographql/apollo-client/issues/3578)
 * see [fetch polyfill](https://www.apollographql.com/docs/link/links/http.html#options)
 *
 * @param app the ReactApp to connect with the DataLayer
 * @schema specifies the schema to connect the store with, if undefined: use the uri (via network). see [[UseSchemaLinkSpec]]
 */
export const connectWithDataLayer = (dataLayerId, request, isOffline) => async (app) => {

    /**
     * we MUST NOT IMPORT CONTEXTs directly, but require them at time of use generally from Infrastructure-Components
     * because this then resolves to node_modules
     */
    const AttachDataLayer = require("infrastructure-components").AttachDataLayer;
    
    //console.log("AttachDataLayer: ", AttachDataLayer)

    //console.log("connectWithDataLayer: ", dataLayerId);
    // load the IsomorphicComponent
    // we must load it directly from the module here, to enable the aliad of the config_file_path
    const isoConfig = loadConfigurationFromModule(require('__CONFIG_FILE_PATH__'), INFRASTRUCTURE_MODES.RUNTIME);

    // with a clientApp, we can check whether it is wrapped into a datalayer
    const dataLayer = extractObject(
        isoConfig,
        Types.INFRASTRUCTURE_TYPE_COMPONENT,
        dataLayerId
    );

    if (isOffline) {
        //console.log("connectWithDataLayer - setOffline!")
        dataLayer.setOffline(true);
    }


    //console.log("dataLayer: ", dataLayer);
    
    return new Promise<any>(async (resolve, reject) => {
        const awsGraphqlFetch = (uri, options) => {
            //console.log("fetch: ",uri, options);
            //options.headers["Authorization"] = token;
            return fetch(uri, options);
        };

        const graphqlUrl = getGraphqlUrl(isOffline); // "https://yfse1b9v0m.execute-api.eu-west-1.amazonaws.com/dev/query";// process.env.DOMAIN_URL + "/"+process.env.GRAPHQL_PATH;

        const client = createApolloClient(dataLayer, graphqlUrl, request);
        dataLayer.setClient(client);

        const connectedApp = <ApolloProvider client={client}>
            <ApolloConsumer>
                {client => <AttachDataLayer apolloClient={client} dataLayer={dataLayer}>{app}</AttachDataLayer>}
            </ApolloConsumer>
        </ApolloProvider>

        //console.log("connectedApp: ", connectedApp);
        try {
            //.catch((err) => console.log("err: ", err))
            await getDataFromTree(connectedApp).then(() => resolve({connectedApp: connectedApp, getState: () => {
                //console.log("time to resolve");
                const data = client.extract();
                //console.log("data: ", data);
                return importEnvironmentVariables(data, graphqlUrl.trim())
            }}));
        } catch (error) {
            console.log("error: ", error);
        }

    });
}
