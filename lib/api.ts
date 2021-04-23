import { GraphQLClient } from 'graphql-request';
import { API_URL, API_USERNAME } from './constants';
import { RequestDocument, Variables } from 'graphql-request/dist/types';
import Router from 'next/router';

import Cookies from 'js-cookie';
import { getSdk, UserExpiredTokenDocument, UserNodeIdTypeEnum } from '../lib/generated/graphql';
import useSWR from 'swr';
import { useMemo } from 'react';
import { FetcherArgs } from './type/FetchArgs';
import { Configuration, Fetcher } from 'swr/dist/types';

const COOKIES_TOKEN_NAME = 'wpt';
export const retrieveToken = () => Cookies.get(COOKIES_TOKEN_NAME);
const setToken = (token) => Cookies.set(COOKIES_TOKEN_NAME, token);
const clearToken = () => Cookies.remove(COOKIES_TOKEN_NAME);

const client = new GraphQLClient(API_URL);
const sdk = getSdk(client);

export const refreshToken = async () => {
    client.setHeader('Authorization', '');

    const res = await sdk.getToken({
        password: 'admin',
        username: 'admin',
    });

    setToken(res.login.authToken);

    return res.login.authToken
};

export const fetcher = async (args: FetcherArgs) => {
    if (args.isUseToken) client.setHeader('Authorization', `Bearer ${retrieveToken()}`);
    const data = await client.request(args.query, args.variables).catch((err) => err);

    return data;
};

export const fetchData = async (args: FetcherArgs) => {
    const data = await new Promise<any>(async (resolve, reject) => {
        let res = () =>
            fetcher(args).then(async (response) => {
                if (response?.response)
                    if ('errors' in response.response) {
                        await refreshToken();
                        // Router.reload()
                    }

                resolve(response);
                return response;
            });
        res();
    });

    return data;
};

export const fetchSWR = (args: FetcherArgs) => {
    let token = retrieveToken()

    if(args.isUseToken) {
        //  refreshToken()
         client.setHeader('Authorization', `Bearer ${token}`);
    }
    // const params = useMemo(() => args, [])
    const options: {onError: any, shouldRetryOnError: boolean, initialData?: object} = {
        onError: () => {
            token = refreshToken()
        },
        shouldRetryOnError: true
    }

    if(args.initialData) options.initialData = args.initialData

    const { data, error } = useSWR([args], fetcher, options);

    return {
        data: data,
        isLoading: !error && !data,
        isError: error,
    };
};

export const fetchStatic = async (args: FetcherArgs, token: string ) => {
    /**
     * this fetch method called after
     * access /api page
     * and already have token
     */
    if (args.isUseToken) {
        client.setHeader('Authorization', `Bearer ${token}`);

        const exp = await client.request(UserExpiredTokenDocument, {id: API_USERNAME, idType: UserNodeIdTypeEnum.Username})
        const expDate = exp.user?.jwtAuthExpiration

        if(Date.now() == expDate * 1000) {
            await refreshToken()
            client.setHeader('Authorization', `Bearer ${retrieveToken()}`);
        }
    }

    const data = await client.request(args.query, args.variables);

    return data;
};
