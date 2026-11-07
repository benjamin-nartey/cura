
// Presentation-only fixtures. No patient, scheduling or billing API is called.
export const TOUR_DURATION=5600;
export const TOUR_STAGES=[0,700,2000,3100,3900] as const;
export const workflows=[
 {id:'appointment',section:'Appointment agenda',open:'Book appointment',title:'New appointment',labels:['Patient','Visit & time'],values:['Ama Owusu','Follow-up · Tue, 09:30'],save:'Confirm appointment',result:'09:30 · Ama Owusu',detail:'Dr. Kwame Boateng · Outpatient',badge:'Confirmed',success:'Appointment booked',steps:['Open a new booking','Find the patient','Choose a visit time','Confirm the booking','Added to the agenda']},
 {id:'patient',section:'Patient directory',open:'Add patient',title:'Register a patient',labels:['Full name','Date of birth'],values:['Ama Owusu','14 May 1988'],save:'Create patient record',result:'Ama Owusu',detail:'Patient ID · CS-1042',badge:'Registered',success:'Patient record created',steps:['Open patient registration','Enter patient details','Add date of birth','Save the identity record','Patient added to the directory']},
 {id:'task',section:'Care coordination',open:'Create task',title:'Coordinate the next step',labels:['Task','Assign to'],values:['Coordinate follow-up','Akosua Mensah'],save:'Assign task',result:'Coordinate follow-up',detail:'Akosua Mensah · Care coordinator',badge:'Assigned',success:'Task assigned',steps:['Create a follow-up task','Describe the next step','Choose a coordinator','Assign the task','Handoff added to pending work']},
 {id:'billing',section:'Encounter billing',open:'Add charge',title:'Draft a service charge',labels:['Service','Amount'],values:['Outpatient consultation','GHS 150.00'],save:'Save draft charge',result:'Consultation · GHS 150.00',detail:'Ama Owusu · Encounter linked',badge:'Draft',success:'Draft charge saved',steps:['Add a service charge','Choose the recorded service','Enter the charge amount','Save the draft','Draft added to the encounter']},
 {id:'access',section:'Workspace context',open:'Review access',title:'Choose your care context',labels:['Facility','Purpose'],values:['Accra care centre','Treatment'],save:'Apply workspace context',result:'Treatment workspace',detail:'Clinician · Accra care centre',badge:'Scoped',success:'Workspace context selected',steps:['Review workspace access','Choose the facility','Select the purpose','Apply the workspace context','Context stays visible while you work']},
] as const;
export function tourStage(elapsed:number){return elapsed<700?0:elapsed<2000?1:elapsed<3100?2:elapsed<3900?3:4;}
export function tourValue(value:string,field:number,elapsed:number,reduced:boolean){
 const start=TOUR_STAGES[field+1]!,duration=field===0?950:800;
 return reduced?(elapsed>=start?value:''):value.slice(0,Math.max(0,Math.min(value.length,Math.floor((elapsed-start)/duration*value.length))));
}
