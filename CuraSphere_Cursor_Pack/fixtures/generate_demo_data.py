#!/usr/bin/env python3
"""Synthetic deterministic CuraSphere demo fixtures. NEVER import into production.
Run: python fixtures/generate_demo_data.py
All values and identities fictional. Test operational behaviors, not clinical safety.
"""
from pathlib import Path
import json, csv, random, hashlib
R=Path(__file__).resolve().parent
rng=random.Random(20261013)
tenants=[
 {"id":"DEMO_GH","name":"Akwaaba Demo Health Network (SYNTHETIC)","jurisdiction":"GH","timezone":"Africa/Accra","currency":"GHS","synthetic":True,"facilities":["ACCRA_DEMO_HOSPITAL","TEMA_DEMO_CLINIC"]},
 {"id":"DEMO_EU","name":"Meridian Demo Care (SYNTHETIC)","jurisdiction":"IE","timezone":"Europe/Dublin","currency":"EUR","synthetic":True,"facilities":["DUBLIN_DEMO_CLINIC"]}]
facilities=[{"id":"ACCRA_DEMO_HOSPITAL","tenant_id":"DEMO_GH","name":"Akwaaba Demo Hospital (fictional)","type":"hospital","synthetic":True},
 {"id":"TEMA_DEMO_CLINIC","tenant_id":"DEMO_GH","name":"Tema Demo Clinic (fictional)","type":"clinic","synthetic":True},
 {"id":"DUBLIN_DEMO_CLINIC","tenant_id":"DEMO_EU","name":"Meridian Demo Clinic (fictional)","type":"clinic","synthetic":True}]
roles=['doctor','nurse','lab_technician','pharmacist','receptionist','facility_admin','cashier','privacy_officer','research_analyst']
staff=[]
for fi,facility in enumerate(facilities):
 for j,role in enumerate(roles):
  staff.append({"id":f"STAFF-{fi+1:02d}-{j+1:02d}","synthetic":True,"tenant_id":facility['tenant_id'],"facility_id":facility['id'],"display_name":f"Synthetic {role.replace('_',' ').title()} {fi+1}","role":role,"email":f"test-{fi+1}-{role.replace('_','-')}@example.invalid"})
patient_names=['Ama Test','Kojo Example','Akosua Sample','Kwame Mock','Esi Demo','Kofi Fiction','Adwoa Test','Yaw Example','Abena Sample','Kwaku Mock','Maya Test','Leo Example','Nora Sample','Eva Demo','Noah Fiction','Ella Mock','Ivy Sample','Nia Test','Theo Fiction','Sam Example']
patients=[]; appointments=[]; encounters=[]; observations=[]; allergies=[]; medications=[]; lab_orders=[]; lab_results=[]; care_tasks=[]; invoices=[]; payments=[]; device_readings=[]
for i in range(40):
 tenant_id='DEMO_GH' if i<30 else 'DEMO_EU'
 fid= ('ACCRA_DEMO_HOSPITAL' if i%3 else 'TEMA_DEMO_CLINIC') if i<30 else 'DUBLIN_DEMO_CLINIC'
 pid=f'SYN-PAT-{i+1:04d}'
 pname=patient_names[i%len(patient_names)]
 patients.append({'id':pid,'synthetic':True,'tenant_id':tenant_id,'home_facility_id':fid,'display_name':pname,'date_of_birth':f'{1965+(i*7)%45}-{1+i%12:02d}-{1+(i*3)%27:02d}','sex_at_birth':'unknown' if i%11==0 else ('female' if i%2==0 else 'male'),'email':f'{pid.lower()}@example.invalid','source_version':1})
 if i in (0,30): allergies.append({'id':f'ALG-{i+1:04d}','patient_id':pid,'tenant_id':tenant_id,'facility_id':fid,'substance_text':'Synthetic penicillin allergy report — unverified','status':'unverified','source_version':1,'synthetic':True})
 for k in range(3):
  eid=f'ENC-{i+1:04d}-{k+1:02d}'
  day=1+(i+k*5)%25
  date=f'2026-09-{day:02d}'
  astat=('no-show' if k==2 and i%9==0 else 'completed')
  appointments.append({'id':f'APP-{i+1:04d}-{k+1:02d}','tenant_id':tenant_id,'patient_id':pid,'facility_id':fid,'scheduled_at':f'{date}T09:30:00Z','status':'no-show' if astat=='no-show' else 'completed','synthetic':True})
  encounters.append({'id':eid,'tenant_id':tenant_id,'patient_id':pid,'facility_id':fid,'appointment_id':appointments[-1]['id'],'status':'cancelled' if astat=='no-show' else 'closed','started_at':f'{date}T09:35:00Z','source_version':1,'synthetic':True})
  if astat!='no-show':
   v=round(117+(i*7+k*3)%38,1)
   observations.append({'id':f'OBS-{i+1:04d}-{k+1:02d}','tenant_id':tenant_id,'patient_id':pid,'encounter_id':eid,'facility_id':fid,'code_system':'http://loinc.org','code':'8480-6','code_display':'Systolic blood pressure','value':v,'unit':'mm[Hg]','observed_at':f'{date}T09:40:00Z','source_version':1,'synthetic':True,'demo_only':True})
   if k==1:
    lab_orders.append({'id':f'LABO-{i+1:04d}','tenant_id':tenant_id,'patient_id':pid,'encounter_id':eid,'facility_id':fid,'test_code':'4548-4','test_display':'Hemoglobin A1c/Hemoglobin.total in Blood','status':'resulted','synthetic':True})
    lab_results.append({'id':f'LABR-{i+1:04d}','order_id':lab_orders[-1]['id'],'tenant_id':tenant_id,'patient_id':pid,'value':round(5.0+(i%12)*0.27,2),'unit':'%','method':'synthetic-demo','reference_range_version':'DEMO-NOT-CLINICALLY-APPROVED','status':'final','source_version':1,'synthetic':True,'demo_only':True})
  if k==0:
   care_tasks.append({'id':f'TASK-{i+1:04d}','patient_id':pid,'tenant_id':tenant_id,'owner_role':'nurse','type':'followup','status':'open' if i%4==0 else 'completed','due_at':'2026-10-28T09:00:00Z','synthetic':True})
   invoices.append({'id':f'INV-{i+1:04d}','tenant_id':tenant_id,'patient_id':pid,'currency':'GHS' if tenant_id=='DEMO_GH' else 'EUR','amount_minor':(8500 if tenant_id=='DEMO_GH' else 4500),'status':'settled' if i%4 else 'partially_paid','synthetic':True})
   payments.append({'id':f'PAY-{i+1:04d}','invoice_id':invoices[-1]['id'],'tenant_id':tenant_id,'amount_minor':invoices[-1]['amount_minor'] if i%4 else invoices[-1]['amount_minor']//2,'provider':'synthetic-no-network','status':'posted','synthetic':True})
 if i%5==0:
  medications.append({'id':f'MED-{i+1:04d}','tenant_id':tenant_id,'patient_id':pid,'facility_id':fid,'status':'active','medication_text':'Synthetic demo medicine — not prescription guidance','dose_text':'TEST-ONLY, do not prescribe','source_version':1,'synthetic':True})
 if i%6==0:
  for k in range(3):device_readings.append({'id':f'DEVOBS-{i+1:04d}-{k+1:02d}','patient_id':pid,'tenant_id':tenant_id,'device_id':f'DEMO-DEVICE-{i+1:04d}','device_time':f'2026-10-{10+k:02d}T08:00:00Z','received_at':f'2026-10-{10+k:02d}T08:02:00Z','value':120+i%20+k,'unit':'mm[Hg]','synthetic':True,'demo_only':True})
fixture={'meta':{'synthetic':True,'environment':'test','seed':20261013,'clinical_validation':False,'intended_use':'Software testing and UX workflow simulation only','warning':'Fictitious values, not medically approved rules or clinical evidence.'},'tenants':tenants,'facilities':facilities,'staff':staff,'patients':patients,'appointments':appointments,'encounters':encounters,'observations':observations,'allergies':allergies,'medications':medications,'lab_orders':lab_orders,'lab_results':lab_results,'care_tasks':care_tasks,'invoices':invoices,'payments':payments,'device_readings':device_readings}
(R/'demo_healthcare.json').write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf8')
with (R/'demo_encounters.csv').open('w',newline='',encoding='utf8') as f:
 w=csv.DictWriter(f,fieldnames=list(encounters[0]));w.writeheader();w.writerows(encounters)
assert len(patients)==40 and len(encounters)==120 and len({x['id'] for x in patients})==40
assert all(f['tenant_id']==p['tenant_id'] for p in patients for f in facilities if f['id']==p['home_facility_id'])
assert all(e['patient_id'] in {p['id'] for p in patients} for e in encounters)
print('Generated',len(patients),'synthetic patients,',len(encounters),'encounters,',len(lab_results),'labs across',len(tenants),'tenants')
