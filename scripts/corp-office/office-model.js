/* State-only helper shared by the renderer and its regression check. */
class OfficeModel {
  constructor() { this.project = null; this.seen = new Set(); this.current = null; }
  accept(snapshot) {
    const reset = snapshot.baseline || this.project !== snapshot.project;
    const events = reset ? [] : snapshot.handoffs.filter(e => !this.seen.has(e.id));
    this.project = snapshot.project;
    this.current = snapshot;
    this.seen = new Set(snapshot.handoffs.map(e => e.id));
    return events;
  }
}
globalThis.OfficeModel = OfficeModel;
if (typeof module !== 'undefined') module.exports = OfficeModel;
