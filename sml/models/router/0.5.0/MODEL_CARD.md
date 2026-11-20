# Model card: router 0.5.0 (REJECTED candidate, kept only as a record)

Trained on train + train_extra + train_extra2; settings chosen on the 424-row dev set. The dev-only rule picked blend weight 0.0 and guard threshold 0.15 (a single missed dev message flipped the threshold from 0.20), giving a false alarm of 13-15% on every set. Superseded by 0.5.1 (enlarged dev, TRACKER C20a/C20b). Not evaluated on any sealed set.
