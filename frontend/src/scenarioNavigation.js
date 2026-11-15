/**
 * Scenario Lab is a dialog, not a dashboard route.
 * Opening it must leave the underlying workspace mounted and preserve scroll.
 */
export function resolveScenarioNavigation(currentPage,targetPage){
  return targetPage==='scenario'
    ? {page:currentPage,scenarioOpen:true,scroll:false}
    : {page:targetPage,scenarioOpen:false,scroll:true};
}
