// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBiatSPlFduccWDUib4A953rRdX9Cjyu1w",
  authDomain: "bilis-paps.firebaseapp.com",
  projectId: "bilis-paps",
  storageBucket: "bilis-paps.appspot.com",
  messagingSenderId: "202516520331",
  appId: "1:202516520331:web:bebbb5bf12f90ea998638e",
  measurementId: "G-Z3KGFY19HJ"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Create namespace immediately
window.firebaseServices = {
  db,
  auth,
  firebase
};