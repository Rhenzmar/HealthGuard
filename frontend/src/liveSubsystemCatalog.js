/**
 * Exactly the 17 features in data/synthetic_17ch/biomarker_schema.json.
 * Five are simulated physiological stream signals; four are physiological
 * estimates from a different fictional source; eight are mission engineering.
 */
export const SUBSYSTEMS = Object.freeze([
  {id:'cardiovascular',title:'Cardiovascular',icon:'heart',branch:'physiological',description:'Heart function and blood pressure',
    keys:['heart_rate_bpm','hrv_rmssd_ms','systolic_bp_mmhg','diastolic_bp_mmhg']},
  {id:'respiratory',title:'Respiratory & oxygenation',icon:'wind',branch:'physiological',description:'Breathing, blood oxygen and exhaled CO₂',
    keys:['spo2_percent','respiratory_rate_bpm','etco2_mmhg']},
  {id:'thermal',title:'Thermoregulation',icon:'thermometer',branch:'physiological',description:'Core and peripheral temperature',
    keys:['core_temp_c','peripheral_temp_c']},
  {id:'cabin',title:'Cabin atmosphere',icon:'layers',branch:'engineering',description:'Fictional spacecraft environment',
    keys:['cabin_co2_ppm','cabin_o2_percent','cabin_pressure_kpa','cabin_temp_c','cabin_humidity_percent']},
  {id:'radiation',title:'Radiation exposure illustration',icon:'satellite',branch:'engineering',description:'Simulated dose rate and accumulated dose',
    keys:['radiation_rate_usv_h','cumulative_dose_usv']},
  {id:'suit',title:'Suit oxygen reserve',icon:'radio',branch:'engineering',description:'Fictional suit oxygen reserve',
    keys:['suit_o2_remaining_percent']}
]);
export const CHANNELS = Object.freeze({
  heart_rate_bpm:{label:'Heart rate',unit:'bpm',digits:0,origin:'stream'},
  spo2_percent:{label:'Oxygen saturation',unit:'%',digits:1,origin:'stream'},
  respiratory_rate_bpm:{label:'Respiratory rate',unit:'breaths/min',digits:1,origin:'stream'},
  core_temp_c:{label:'Core temperature',unit:'°C',digits:2,origin:'stream'},
  hrv_rmssd_ms:{label:'HRV (RMSSD)',unit:'ms',digits:1,origin:'stream'},
  systolic_bp_mmhg:{label:'Systolic pressure',unit:'mmHg',digits:1,origin:'estimate'},
  diastolic_bp_mmhg:{label:'Diastolic pressure',unit:'mmHg',digits:1,origin:'estimate'},
  peripheral_temp_c:{label:'Peripheral temperature',unit:'°C',digits:2,origin:'estimate'},
  etco2_mmhg:{label:'End-tidal CO₂',unit:'mmHg',digits:1,origin:'estimate'},
  cabin_co2_ppm:{label:'Cabin CO₂',unit:'ppm',digits:1,origin:'engineering'},
  cabin_o2_percent:{label:'Cabin oxygen',unit:'%',digits:2,origin:'engineering'},
  cabin_pressure_kpa:{label:'Cabin pressure',unit:'kPa',digits:2,origin:'engineering'},
  cabin_temp_c:{label:'Cabin temperature',unit:'°C',digits:1,origin:'engineering'},
  cabin_humidity_percent:{label:'Relative humidity',unit:'%',digits:1,origin:'engineering'},
  radiation_rate_usv_h:{label:'Radiation dose rate',unit:'µSv/h',digits:3,origin:'engineering'},
  cumulative_dose_usv:{label:'Accumulated dose',unit:'µSv',digits:4,origin:'engineering'},
  suit_o2_remaining_percent:{label:'Suit O₂ reserve',unit:'%',digits:2,origin:'engineering'}
});
export const CHANNEL_KEYS=Object.freeze(SUBSYSTEMS.flatMap(group=>group.keys));
export function subsystemValues(group,live,engineering){
  return group.keys.map(key=>{
    const channel=CHANNELS[key];
    const source=channel.origin==='stream'?live:engineering;
    const value=source?.[key];
    return {key,...channel,value:Number.isFinite(value)?value:null};
  });
}
