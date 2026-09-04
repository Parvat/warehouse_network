# Open questions

Figures Trace uses that a dealer or engineer has to confirm. Each one is a
working assumption: the arithmetic is right, the number in it is a guess made
carefully rather than measured.

## Drive-in lane clearance — 8 in

`LANE_CLEARANCE_IN` in `packages/rack-engine/src/constants.ts`.

A drive-in or drive-through lane is one pallet wide plus the room the truck
needs to get past it on both sides, because the truck drives inside the rack
and the pallet rests on rails along the uprights rather than on a beam. Trace
uses **8 in in total** — four a side.

It decides how many lanes fit across a block, and so the position count: a 40 in
pallet gives a 4 ft lane, and an inch either way moves the lane count in a long
building. Confirm against the truck's actual mast width and the dealer's own
lane standard before quoting from it.
