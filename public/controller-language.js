/** Short explanations of supported saved mode assignments; no device state or operating sequence is inferred. */
const ACTIONS={
  0:['Arm / disarm motors','Arming lets the motors run; disarming tells them to stop. The quad can still block arming if its checks fail.'],
  1:['Self-leveling flight','Helps the quad return toward level when the sticks are centered. It does not hold position.'],
  2:['Self-leveling with flips','Levels near center stick, while allowing flips at larger stick movements.'],
  13:['Find the quad','Asks the quad to beep so you can find it. Needs a configured buzzer or motor beeper.'],
  26:['Flight recording','Controls onboard flight-data recording.'],
  27:['Failsafe request','Requests the configured loss-of-control-link response.'],
  28:['Low-throttle control','Selects Airmode. See the technical details for this assignment.'],
  31:['Erase flight recording','Requests deletion of onboard flight data.'],
  35:['Crash-flip mode','Selects Turtle mode for turning an overturned quad back over. This is separate from normal flight.'],
  36:['Arming permission','Gives permission to arm the motors with the separate arm control. Turning it off does not stop motors that are already armed.'],
  39:['Low-power video','Selects the video transmitter’s pit mode.'],
  40:['Custom aircraft action','A custom output whose hardware function is not established here.'],
  41:['Custom aircraft action','A custom output whose hardware function is not established here.'],
  42:['Custom aircraft action','A custom output whose hardware function is not established here.'],
  43:['Custom aircraft action','A custom output whose hardware function is not established here.'],
  46:['GPS recovery','Uses GPS to try to return toward the takeoff point, not pause and hover. Needs a configured GPS Rescue setup.'],
  47:['Limited-angle practice','Selects Acro Trainer. See the technical details for its limits.'],
  48:['Video-control lock','Disables video-transmitter control through the aircraft overlay.'],
};
const shown=c=>c.displayMapping??c.mapping;
const signature=c=>JSON.stringify([...new Set(c.rules.map(r=>JSON.stringify([r.mode,r.start,r.end,r.logic,r.linked])))].sort());
const modes=c=>[...new Set(c.rules.map(r=>r.mode))].sort((a,b)=>a-b).join(',');
/** Describe an action without promoting a suggested mapping to a recorded or checked one. */
export function friendlyControl(control,complete) {
  const common={actions:[],notice:null,partial:!complete};
  if(shown(control).kind==='external'){
    return {...common,title:control.id==='power'?'Controller power':'Controller or camera control',
      description:control.id==='power'?'Turns the controller on or off. This is separate from the quad’s motor controls.':'Handled outside the aircraft settings shown here. Any recorded notes are in Advanced details.'};
  }
  if(shown(control).kind==='unknown')return {...common,title:'Not described by this backup',description:'It may still have a controller or camera function. This backup does not identify it.'};
  if(!control.rules.length)return {...common,title:complete?'No aircraft action saved':'Not enough information',
    description:complete?'This backup assigns no aircraft action to this control’s connection. It may still have a controller or camera function.':'This backup does not establish its aircraft action. Missing information does not mean the control is disabled.'};
  const actions=[...new Map(control.rules.map(rule=>{
    const known=ACTIONS[rule.mode]&&!/^Mode\s+\d+/.test(rule.label);
    const [title,description]=known?ACTIONS[rule.mode]:['Action needs review','This backup contains an action this view cannot explain yet. Its original details remain available.'];
    return [rule.mode,{mode:rule.mode,title,description}];
  })).values()];
  const arm=control.rules.filter(r=>r.mode===0),rescue=control.rules.filter(r=>r.mode===46);
  const overlapping=complete&&arm.some(a=>rescue.some(b=>!a.logic&&!a.linked&&!b.logic&&!b.linked&&Math.max(a.start,b.start)<Math.min(a.end,b.end)));
  return {...common,actions,title:actions.map(a=>a.title).join(' / '),
    description:actions.length===1?actions[0].description:'This control has more than one saved action. Which action is requested depends on the switch position or button state.',
    notice:overlapping?'This saved setup can request both motor arming and GPS recovery in the same switch position. Review this shared assignment before relying on this control.':null};
}
/** Confidence belongs to the physical layout, independently of the parsed action names. */
export function layoutConfidence(view) {
  const relevant=view.controls.filter(c=>shown(c).kind==='aux');
  const checked=relevant.filter(c=>c.verified).length;
  if(relevant.length&&checked===relevant.length)return {checked:true,title:'Button layout checked',message:'These button assignments have been marked as checked for this saved setup.'};
  const suggestions=relevant.some(c=>c.mappingSource==='suggested');
  return {checked:false,title:checked?checked+' button assignment'+(checked===1?'':'s')+' checked':'Button layout needs checking',
    message:suggestions?'The buttons below use the usual Controller 3 layout. Check that it matches your controller before relying on it.':'Some recorded button assignments still need checking on the controller.'};
}
/** Compare actions by physical control, without double-counting channel moves or observation edits. */
export function beginnerChanges(comparison) {
  const incomplete=comparison.counts.unknown>0;
  if(incomplete){
    const reasons=comparison.reasons??[];
    const reason=reasons.some(r=>/Firmware or board metadata differs/.test(r))
      ? 'These backups list different aircraft software or hardware. Button changes need review before they can be confirmed.'
      : reasons.some(r=>/sparse|partial/.test(r))
      ? 'One backup leaves out settings. Use full Betaflight backups for both setups to compare their button actions.'
      : reasons.some(r=>/currently supports/.test(r))
      ? 'One backup uses aircraft software that this view cannot fully explain yet.'
      : 'Some control information could not be fully compared. Advanced setup details show the original rules and limits.';
    return {incomplete:true,changes:[],expected:true,reason};
  }
  const changes=[];
  for(const after of comparison.after.controls){
    const before=comparison.before.controls.find(c=>c.id===after.id);
    if(!before||shown(before).kind!=='aux'||shown(after).kind!=='aux'||signature(before)===signature(after))continue;
    const from=friendlyControl(before,comparison.before.complete),to=friendlyControl(after,comparison.after.complete);
    const kind=modes(before)===modes(after)?'activation':'action';
    changes.push({id:after.id,label:after.label,before:from.title,after:to.title,kind,
      explanation:kind==='activation'?'The action is the same, but when this control requests it changed.':'The aircraft action assigned to this control changed.',
      expected:!before.verified||!after.verified||before.mappingSource==='suggested'||after.mappingSource==='suggested'});
  }
  return {incomplete:false,changes,expected:changes.some(c=>c.expected)};
}

/** A limit always has a next step, while old evidence remains immutable. */
export function comparisonGuidance({reasons=[]}={}) {
  if(reasons.some(r=>/Firmware or board metadata differs/.test(r)))return [
    'Next: open each backup in Setup history to see its software version and board. A software change alone does not prove a button changed.',
    'Check the current button assignments in Betaflight’s Receiver and Modes tabs, then record your check on the matching backup. A new backup cannot recover missing historical evidence.',
  ];
  if(reasons.some(r=>/sparse|partial/.test(r)))return [
    'Next: for future backups, run dump all in Betaflight’s CLI and save the complete output as a text file, then use Import setup.',
    'Keep the older backup. A new full backup describes the aircraft now; it does not fill in the older setup’s missing settings.',
  ];
  if(reasons.some(r=>/currently supports/.test(r)))return [
    'Next: keep the original backup and inspect Receiver and Modes in a compatible Betaflight app. This controller guide currently interprets Betaflight 4.5.x mode assignments.',
    'Do not change the aircraft software just to make this view work. Its source settings remain available in Setup history.',
  ];
  return [
    'Next: open Advanced setup details to see which rules need review. Check them in Betaflight’s Modes tab before recording a physical button check.',
    'An unknown action is not proof that the button is unused. Camera and controller functions may live outside this backup.',
  ];
}
