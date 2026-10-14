/** Browser-only portfolio fixture transport. No requests reach FastAPI in demo mode. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_RECALL_MODE === "demo";
export const RECALL_API = DEMO_MODE ? "/demo" : (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");

type Dict = Record<string, unknown>;
const when = "2026-10-01T12:00:00Z";
const documents = [
  { id: 1, filename: "recall-demo-gaze.pdf", created_at: when },
  { id: 2, filename: "recall-demo-number-sense.pdf", created_at: when },
];
type Collection = {id:number;name:string;description:string|null;document_count:number;documents:{id:number;filename:string}[]};
let collections: Collection[] = [
  { id: 1, name: "Developmental cognition", description: "Curated demonstration sources", document_count: 2, documents: documents.map(d => ({id:d.id, filename:d.filename})) },
];
type Citation = {filename:string;page:number|null;evidence:string};
const gazeEvidence = "In this illustrative study, gaze cues were compared across open-eye and closed-eye conditions.";
const numberEvidence = "In this illustrative study, infants observed comparisons between two sets of objects.";
const examples: {question:string; answer:string; citations:Citation[]}[] = [
  {question:"What does the gaze-following demonstration show?",answer:"DEMO RESPONSE — This is a scripted example, not live AI inference.\n\nThe illustrative gaze-following document describes a simplified comparison between open-eye and closed-eye cues. It demonstrates how Recall connects a research summary to the relevant page of a source PDF. These examples are intentionally fictional and are not empirical findings.",citations:[{filename:documents[0].filename,page:1,evidence:gazeEvidence}]},
  {question:"How does the number-sense example work?",answer:"DEMO RESPONSE — This is a scripted example, not live AI inference.\n\nThe illustrative number-sense document describes infants observing two sets of objects. In the live Recall system, retrieved text chunks and citations would ground an answer. This portfolio example is synthetic and should not be treated as a research result.",citations:[{filename:documents[1].filename,page:1,evidence:numberEvidence}]},
  {question:"How does Recall connect an answer to its PDF?",answer:"DEMO RESPONSE — This is a scripted example, not live AI inference.\n\nRecall attaches a source filename, page number, and supporting excerpt to an answer. Select the numbered citation below to open the original demo PDF in the Evidence Desk, then bookmark it for reference.",citations:[{filename:documents[0].filename,page:1,evidence:gazeEvidence}]},
];
type Message = {id:number;role:"user"|"assistant";content:string;citations:Citation[]};
type Conversation = {id:number;title:string;created_at:string;updated_at:string;messages:Message[]};
let conversations: Conversation[] = examples.map((e,i) => ({id:i+1,title:e.question,created_at:when,updated_at:when,messages:[{id:i*2+1,role:"user",content:e.question,citations:[]},{id:i*2+2,role:"assistant",content:e.answer,citations:e.citations}]}));
let nextConversation=10;
let notes: Dict[] = [{id:1,document_id:1,collection_id:1,page_number:1,title:"Demo observation",content:"This note demonstrates how a source-linked annotation appears in Recall.",created_at:when,updated_at:when}];
let bookmarks: Dict[] = [{id:1,document_id:1,collection_id:1,page_number:1,label:"Gaze cues (sample)",evidence:gazeEvidence,created_at:when}];
let nextNote=2, nextBookmark=2, nextCollection=2;
function json(body:unknown,status=200):Response {return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function updated(c:Collection):Collection {return {...c,document_count:c.documents.length};}
function parseBody(init?:RequestInit):Dict {try{return typeof init?.body==="string"?JSON.parse(init.body) as Dict:{}}catch{return {}}}
function route(input: string,init?:RequestInit):Response {
 const url=new URL(input,"https://demo.invalid");
 const p=url.pathname.replace(/^\/demo/,"");
 const method=(init?.method||"GET").toUpperCase();
 const payload=parseBody(init);
 if(p==="/api/v1/documents" && method==="GET")return json(documents);
 if(p==="/api/v1/documents/upload")return json({detail:"Uploads are disabled in the public portfolio demo."},403);
 if(p==="/api/v1/collections"){
   if(method==="GET")return json(collections);
   if(method==="POST") {const c:Collection={id:nextCollection++,name:String(payload.name||"Untitled"),description:String(payload.description||""),document_count:0,documents:[]};collections=[...collections,c];return json(c,201)}
 }
 const membership=p.match(/^\/api\/v1\/collections\/(\d+)\/documents\/(\d+)$/);
 if(membership){const c=collections.find(v=>v.id===Number(membership[1])),d=documents.find(v=>v.id===Number(membership[2]));if(!c||!d)return json({detail:"Not found"},404);if(method==="POST"&&!c.documents.some(v=>v.id===d.id))c.documents.push({id:d.id,filename:d.filename});if(method==="DELETE")c.documents=c.documents.filter(v=>v.id!==d.id);collections=collections.map(updated);return json(c)}
 const cm=p.match(/^\/api\/v1\/collections\/(\d+)$/);
 if(cm){const i=collections.findIndex(c=>c.id===Number(cm[1]));if(i<0)return json({detail:"Not found"},404);if(method==="GET")return json(collections[i]);if(method==="PATCH"){collections[i]={...collections[i],name:String(payload.name||collections[i].name)};return json(collections[i])}if(method==="DELETE"){if(collections[i].documents.length)return json({detail:"Collection must be empty"},409);collections.splice(i,1);return json({ok:true})}}
 if(p==="/api/v1/conversations"&&method==="GET")return json(conversations.map(({messages:_,...rest})=>rest));
 const conversation=p.match(/^\/api\/v1\/conversations\/(\d+)$/);
 if(conversation){const c=conversations.find(v=>v.id===Number(conversation[1]));if(!c)return json({detail:"Not found"},404);if(method==="GET")return json(c);if(method==="DELETE"){conversations=conversations.filter(v=>v.id!==c.id);return json({ok:true})}}
 if(p==="/api/v1/notes"){
   if(method==="GET")return json(notes);
   if(method==="POST"){const n={...payload,id:nextNote++,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};notes=[n,...notes];return json(n,201)}
 }
 const note=p.match(/^\/api\/v1\/notes\/(\d+)$/);
 if(note){const i=notes.findIndex(v=>v.id===Number(note[1]));if(i<0)return json({detail:"Not found"},404);if(method==="PATCH"){notes[i]={...notes[i],...payload,updated_at:new Date().toISOString()};return json(notes[i])}if(method==="DELETE"){notes.splice(i,1);return json({ok:true})}}
 if(p==="/api/v1/bookmarks"){
   if(method==="GET")return json(bookmarks);
   if(method==="POST"){const b={...payload,id:nextBookmark++,created_at:new Date().toISOString()};bookmarks=[b,...bookmarks];return json(b,201)}
 }
 const bookmark=p.match(/^\/api\/v1\/bookmarks\/(\d+)$/);
 if(bookmark){const i=bookmarks.findIndex(v=>v.id===Number(bookmark[1]));if(i<0)return json({detail:"Not found"},404);if(method==="PATCH"){bookmarks[i]={...bookmarks[i],...payload};return json(bookmarks[i])}if(method==="DELETE"){bookmarks.splice(i,1);return json({ok:true})}}
 if(p==="/api/v1/query/stream"&&method==="POST"){
   const question=String(payload.question||"").trim();
   const matched=examples.find(e=>e.question.toLowerCase()===question.toLowerCase());
   if(!matched)return json({detail:"Demo mode supports only the three suggested questions."},403);
   const id=typeof payload.conversation_id==="number"?payload.conversation_id:nextConversation++;
   let c=conversations.find(x=>x.id===id);
   if(!c){c={id,title:question,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),messages:[]};conversations=[c,...conversations]}
   c.messages.push({id:Date.now(),role:"user",content:question,citations:[]},{id:Date.now()+1,role:"assistant",content:matched.answer,citations:matched.citations});
   c.updated_at=new Date().toISOString();
   const events=[{type:"replace",content:matched.answer},{type:"citations",content:matched.citations},{type:"saved",conversation_id:id}];
   return new Response(events.map(e=>JSON.stringify(e)).join("\n")+"\n",{headers:{"Content-Type":"application/x-ndjson"}});
 }
 return json({detail:"This endpoint is unavailable in the public demo."},404);
}
export async function recallFetch(input: string | URL | Request, init?:RequestInit):Promise<Response>{
 if(!DEMO_MODE)return fetch(input,init);
 // Hard fail rather than sending traffic outside the fixture transport.
 if(typeof input!=="string"||!input.startsWith("/demo/api/v1/"))return json({detail:"External requests disabled in demo mode."},403);
 return route(input,init);
}
export function demoPdfUrl(id:number):string {return `/demo-papers/${id===1?"recall-demo-gaze.pdf":"recall-demo-number-sense.pdf"}`}
export const DEMO_QUESTIONS=examples.map(e=>e.question);
