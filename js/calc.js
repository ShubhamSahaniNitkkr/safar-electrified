(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SafarCalc = api;
})(typeof self !== "undefined" ? self : this, function () {
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, Number(n) || 0));
  }

  function roomsFor(people, perRoom) {
    const fit = Math.max(1, Number(perRoom) || 2);
    return Math.max(1, Math.ceil((Number(people) || 1) / fit));
  }

  function fitFor(line, ctx) {
    return Math.max(1, Number(line && line.per_room) || Number(ctx && ctx.per_room) || 2);
  }

  function roomsUsed(line, ctx) {
    if (ctx && ctx.roomsAuto === false) return Math.max(1, Number(ctx.rooms) || 1);
    return roomsFor(ctx.people, fitFor(line, ctx));
  }

  function lineAmount(line, ctx) {
    const amount = Number(line.amount) || 0;
    switch (line.basis) {
      case "person":
        return amount * ctx.people;
      case "person_day":
        return amount * ctx.people * ctx.days;
      case "room_night":
        return amount * roomsUsed(line, ctx) * ctx.nights;
      default:
        return amount;
    }
  }

  function foodRate(lines, party, days, fallback) {
    party = Number(party) || 0;
    days = Number(days) || 0;
    if (!lines || !lines.length || !party || !days) return fallback;
    const total = lines.reduce(function (sum, line) {
      return sum + lineAmount(line, { people: party, days: days, nights: 0, rooms: 1 });
    }, 0);
    if (!total) return fallback;
    return total / party / days;
  }

  function estimate(input) {
    const people = clamp(input.people, 1, 12);
    const days = clamp(input.days, 1, 30);
    const nights = clamp(input.nights, 0, 30);
    const rooms = clamp(input.rooms, 1, 12);
    const foodRateValue = Math.max(0, Number(input.foodRate) || 0);
    const ctx = {
      people: people,
      days: days,
      nights: nights,
      rooms: rooms,
      roomsAuto: input.roomsAuto !== false,
      per_room: input.per_room,
    };
    const lines = (input.lines || []).map(function (line) {
      const on = line.on !== false;
      const fit = fitFor(line, ctx);
      return {
        id: line.id,
        category: line.category,
        label: line.label,
        basis: line.basis,
        per_room: fit,
        rooms: line.basis === "room_night" ? roomsUsed(line, ctx) : rooms,
        on: on,
        amount: lineAmount(line, ctx),
      };
    });
    const extras = (input.extras || []).map(function (extra) {
      return { id: extra.id, label: extra.label, amount: Number(extra.amount) || 0 };
    });
    const foodAmount = foodRateValue * people * days;
    const total =
      lines.reduce(function (sum, line) {
        return sum + (line.on ? line.amount : 0);
      }, 0) +
      extras.reduce(function (sum, extra) {
        return sum + extra.amount;
      }, 0) +
      foodAmount;
    return {
      people: people,
      days: days,
      nights: nights,
      rooms: rooms,
      lines: lines,
      extras: extras,
      foodRate: foodRateValue,
      foodAmount: foodAmount,
      total: total,
      perPerson: people ? total / people : total,
    };
  }

  function planTrip(trip, costs, changes, state) {
    const foodLines = [];
    const lines = [];
    (costs || []).forEach(function (cost, index) {
      const line = {
        id: "c" + index,
        category: String(cost.category || "other").toLowerCase(),
        label: cost.label || "Cost",
        amount: Number(cost.amount) || 0,
        basis: cost.basis || "trip",
        per_room: Number(cost.per_room) || 0,
      };
      if (line.category === "food") foodLines.push(line);
      else lines.push(line);
    });
    (changes || []).forEach(function (change, index) {
      lines.push({
        id: "e" + index,
        category: "ev",
        label: change.title || "EV change",
        amount: Number(change.cost) || 0,
        basis: "trip",
      });
    });

    const party = Number(trip.party) || 2;
    const recDays = Number(trip.days) || 1;
    const recNights = Number(trip.nights) || 0;
    const recordedFood = foodRate(foodLines, party, recDays, 0);
    const recorded = estimate({
      people: party,
      days: recDays,
      nights: recNights,
      rooms: roomsFor(party, trip.per_room),
      roomsAuto: true,
      per_room: trip.per_room,
      foodRate: recordedFood,
      lines: lines.map(function (line) {
        return Object.assign({}, line, { on: true });
      }),
      extras: [],
    });

    const st = state || {
      people: party,
      days: recDays,
      nights: recNights,
      rooms: roomsFor(party, trip.per_room),
      roomsAuto: true,
      food: recordedFood || 0,
      off: {},
      extras: [],
    };
    const planned = estimate({
      people: st.people,
      days: st.days,
      nights: st.nights,
      rooms: st.rooms,
      roomsAuto: st.roomsAuto !== false,
      per_room: trip.per_room,
      foodRate: st.food,
      lines: lines.map(function (line) {
        return Object.assign({}, line, { on: !(st.off && st.off[line.id]) });
      }),
      extras: st.extras || [],
    });

    return {
      lines: lines,
      foodLines: foodLines,
      recordedFood: recordedFood,
      recorded: recorded,
      planned: planned,
    };
  }

  return {
    clamp: clamp,
    roomsFor: roomsFor,
    fitFor: fitFor,
    lineAmount: lineAmount,
    foodRate: foodRate,
    estimate: estimate,
    planTrip: planTrip,
  };
});
