/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/customers` | `/customers`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/orders` | `/orders`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/pos` | `/pos`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/customers` | `/customers`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/orders` | `/orders`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/pos` | `/pos`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/_sitemap${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/customers${`?${string}` | `#${string}` | ''}` | `/customers${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/orders${`?${string}` | `#${string}` | ''}` | `/orders${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/pos${`?${string}` | `#${string}` | ''}` | `/pos${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/settings${`?${string}` | `#${string}` | ''}` | `/settings${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/customers` | `/customers`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/orders` | `/orders`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/pos` | `/pos`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownInputParams; };
    }
  }
}
