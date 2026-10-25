/** Independently generated CLI-shaped fixture. Never sourced from a personal aircraft export. */
export function fullControllerExport(assignments={}, { omit=[], extra='', kind='dump' }={}) {
  const rows=Array.from({length:20},(_,slot)=>slot).filter(slot=>!omit.includes(slot)&&(kind!=='diff'||Object.hasOwn(assignments,slot))).map(slot=>
    'aux '+slot+' '+(assignments[slot]??'0 0 900 900 0 0'));
  return '# '+kind+' all\n# Betaflight / SYNTHETIC 4.5.2\n# feature\nfeature -GPS\nfeature GPS\n# aux\n'+rows.join('\n')+'\n# adjrange\nadjrange 0 0 0 900 900 0 0 0 0\nset 3d_deadband_low = 1400\n'+extra+'\n# save configuration\nsave\n';
}
