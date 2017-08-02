import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const reservationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  item: { type: Schema.Types.ObjectId, ref: 'Item' },
  start: Number,
  end: Number,
  people: Number
});

export default mongoose.model('Reservation', reservationSchema);
