import { initializeApp, getApps } from 'firebase/app'
import { getDataConnect } from 'firebase/data-connect'
import { connectorConfig } from '../dataconnect-generated'

const firebaseConfig = {
  apiKey: "AIzaSyCzOXlA7fYWrgfTqENKO9gqhnylcmIxOzU",
  authDomain: "the-hub-hackathon.firebaseapp.com",
  projectId: "the-hub-hackathon",
  storageBucket: "the-hub-hackathon.firebasestorage.app",
  messagingSenderId: "239158060499",
  appId: "1:239158060499:web:386bb79249c4062b88bb26",
  measurementId: "G-HXLBGE6TXY"
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const dataConnect = getDataConnect(app, connectorConfig)
