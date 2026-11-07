import {Icon,type IconName} from "./icon";
export type MetricTone="teal"|"blue"|"amber"|"violet";
export function MetricCard({label,value,detail,icon="activity",href,tone="teal",featured=false}:{label:string;value:number;detail?:string;icon?:IconName;href?:string;tone?:MetricTone;featured?:boolean}){
 const content=<><div className="metric-card-top"><span className="metric-card-icon"><Icon name={icon} size={22}/></span>{href&&<span className="metric-card-arrow" aria-hidden="true">↗</span>}</div><p className="metric-label">{label}</p><strong className="metric-value">{value.toLocaleString("en-US")}</strong>{detail&&<p className="metric-card-detail">{detail}</p>}{href&&<span className="metric-card-footer">View records <span aria-hidden="true">→</span></span>}</>;
 return href?<a className="metric-card metric metric-link" data-tone={tone} data-featured={featured} href={href}>{content}</a>:<article className="metric-card metric" data-tone={tone}>{content}</article>;
}
