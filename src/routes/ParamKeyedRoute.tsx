import { Fragment, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';

/** Remount a stateful detail screen before it can act on a different route object. */
export function ParamKeyedRoute(props: {
  param?: string;
  params?: readonly string[];
  children: ReactElement;
}) {
  const routeParams = useParams();
  const names = props.params ?? (props.param ? [props.param] : []);
  const key = names.length > 0
    ? names.map((name) => `${name}:${routeParams[name] ?? 'missing'}`).join('|')
    : 'missing-params';

  return <Fragment key={key}>{props.children}</Fragment>;
}
