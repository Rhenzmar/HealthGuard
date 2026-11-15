/** Guided interface walkthrough. These are UI destinations, not backend capabilities. */
export const TOUR_STORAGE_KEY = 'healthguard.walkthrough.seen.v1';
export const TOUR_STEPS = Object.freeze([
 {target:'dashboard',page:'dashboard',title:'Your mission at a glance',body:'The Mission Dashboard brings your four fictional astronauts, current simulated readings, and PhysioAlert assessments into one view.',hint:'Select a crew member to inspect their monitoring summary.'},
 {target:'telemetry',page:'telemetry',title:'Explore crew telemetry',body:'Inspect the nine physiological readings and their recent trend graphs. Five values are simulator streams; four are separate scripted estimates.',hint:'Use the dropdown to switch the plotted signal.'},
 {target:'body',page:'body',title:'Understand the body',body:'The Body Explorer groups monitored physiological systems and helps you examine how a flagged scenario relates to the body.',hint:'Choose a highlighted body section to see its information.'},
 {target:'routine',page:'routine',title:'Build healthy mission habits',body:'Health Routine turns daily check-ins, learning, and physical-activity challenges into a simple mission game.',hint:'Complete activities and track progress for the selected crew member.'},
 {target:'research',page:'research',title:'Explore the science',body:'Health Library explains astronaut health topics and includes historical NASA research. Those lab records are separate from the fictional live crew.',hint:'Open a topic or research dataset when you want more context.'},
 {target:'mission',page:'mission',title:'Operate mission systems',body:'Mission Control brings together spacecraft monitoring, environmental context, and simulated engineering scenarios.',hint:'Inspect the mission systems before testing a scenario.'},
 {target:'hud',page:'hud',title:'Experience the Mission HUD',body:'The Mission HUD shows how key readings and alerts might appear to an astronaut during a simulated Moon or Mars activity.',hint:'Choose the Moon or Mars view within the HUD.'},
 {target:'scenario',page:'dashboard',title:'Try an interactive scenario',body:'Scenario Lab lets you replay fictional crew-health and spacecraft events, including warnings and alerts. It opens over your current section, so you do not lose your place.',hint:'After the tour, open Scenario Lab from any section to try it.'}
]);
export function validTourIndex(value){
 return Number.isInteger(value)&&value>=0&&value<TOUR_STEPS.length;
}
export function tourDestination(index){
 return validTourIndex(index)?TOUR_STEPS[index].page:'dashboard';
}
