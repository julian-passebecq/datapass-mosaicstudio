import {Component,type ErrorInfo,type ReactNode} from 'react';
import {Button,Spinner} from '../fluent';
import {displayValue,toCsv} from '../core/queries';
import {createBrowserHost} from '../core/host';
export class PanelBoundary extends Component<{children:ReactNode},{error:string|null}>{
  state={error:null as string|null};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('Studio panel failed',error,info.componentStack);}
  render(){return this.state.error?<div className="empty error" role="alert"><h2>Panel unavailable</h2><p>{this.state.error}</p><Button onClick={()=>this.setState({error:null})}>Retry panel</Button></div>:this.props.children;}
}
export function Loading(){return <div className="empty"><Spinner size="small" label="Preparing the workspace"/></div>;}
export function Results({rows,columns,loading=false,error=null,caption='Query results'}:{rows:Record<string,unknown>[];columns:string[];loading?:boolean;error?:string|null;caption?:string}){
  if(loading)return <Loading/>;
  if(error)return <div className="notice error" role="alert">{error}</div>;
  return <div className="results"><div className="results-bar"><span>{rows.length.toLocaleString()} rows in this view</span><Button size="small" disabled={!rows.length} onClick={()=>createBrowserHost().saveDownload('studio-results.csv',new Blob([toCsv(columns,rows)],{type:'text/csv;charset=utf-8'}))}>Export visible CSV</Button></div><div className="table-scroll"><table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map(c=><th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{columns.map(c=><td key={c} title={displayValue(row[c])}>{displayValue(row[c])}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="empty">No rows returned.</p>}</div></div>;
}
export function Header({eyebrow,title,detail,children}:{eyebrow:string;title:string;detail:string;children?:ReactNode}){return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div><div className="heading-actions">{children}</div></div>;}
