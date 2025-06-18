import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, deleteDoc, getDocs } from 'firebase/firestore';

// Context for Firebase services and user data
const FirebaseContext = createContext(null);

// Custom hook to use Firebase context
const useFirebase = () => useContext(FirebaseContext);

// Utility to generate a short, unique game code
const generateGameCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Utility to generate a unique ID for documents if needed (e.g., match IDs)
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Custom Confirmation Modal Component
const ConfirmationModal = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full text-center">
        <h3 className="text-xl font-bold text-gray-800 mb-4">{title}</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-around space-x-4">
          <button
            onClick={onCancel}
            className="flex-1 p-3 rounded-md font-semibold transition duration-300 bg-gray-300 hover:bg-gray-400 text-gray-800 shadow-md"
          >
            No, Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 p-3 rounded-md font-semibold transition duration-300 bg-red-600 hover:bg-red-700 text-white shadow-md"
          >
            Yes, Proceed
          </button>
        </div>
      </div>
    </div>
  );
};


// Main App Component
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [appId, setAppId] = useState(null);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'createGame', 'joinGame', 'gameLobby', 'tournament'
  const [currentGameId, setCurrentGameId] = useState(null);
  const [game, setGame] = useState(null); // Current game data from Firestore

  // Firebase Initialization and Authentication
  useEffect(() => {
    try {
      const firebaseConfig = {
  apiKey: "AIzaSyBni6_iiti4MytyRpfTh95SyC1LhyV9KF0",
  authDomain: "rps-tournament-online.firebaseapp.com",
  projectId: "rps-tournament-online",
  storageBucket: "rps-tournament-online.firebasestorage.app",
  messagingSenderId: "453163680831",
  appId: "1:453163680831:web:cb66974cb075122d5fe48a"
};
setAppId(actualFirebaseConfig.appId);
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing or empty. Please ensure __firebase_config is set.");
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          console.log("Firebase Auth State Changed: Logged in as", user.uid);
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          console.log("Firebase Auth State Changed: No user, signing in anonymously.");
          try {
            // The __initial_auth_token is specific to the Canvas environment.
            // For a live website, we'll primarily use anonymous sign-in or other auth methods.
            await signInAnonymously(firebaseAuth);
          } 
          catch (error) {
            console.error("Error signing in anonymously:", error);
          }
        }
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }, []);

  // Effect to listen to game data when currentGameId changes
  useEffect(() => {
    if (db && currentGameId) {
      const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
      const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setGame(docSnap.data());
          console.log("Current Game Data:", docSnap.data());
          // Automatically navigate based on game state
          if (docSnap.data().status === 'lobby') {
            setCurrentPage('gameLobby');
          } else if (docSnap.data().status === 'playing') {
            setCurrentPage('tournament');
          }
        } else {
          console.log("Game does not exist or has been deleted.");
          setGame(null);
          setCurrentGameId(null);
          setCurrentPage('home'); // Go back to home if game is deleted
        }
      }, (error) => {
        console.error("Error listening to game changes:", error);
      });

      return () => unsubscribe();
    }
  }, [db, currentGameId]);

  // Component for the Home page
  const Home = () => {
    // We get userId from the context, which is provided higher up in the App component.
    const { userId } = useFirebase();
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
        <h2 className="text-4xl font-bold text-gray-800 mb-6">Rock, Paper, Scissors Tournament</h2>
        <p className="text-lg text-gray-600 mb-8 text-center">Challenge your friends to an epic tournament!</p>
        <button
          onClick={() => setCurrentPage('createGame')}
          className="w-full p-4 mb-4 rounded-md text-xl font-bold transition duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
        >
          Create New Game
        </button>
        <button
          onClick={() => setCurrentPage('joinGame')}
          className="w-full p-4 rounded-md text-xl font-bold transition duration-300 bg-green-600 hover:bg-green-700 text-white shadow-lg"
        >
          Join Existing Game
        </button>
        <p className="mt-6 text-sm text-gray-500">Your Session ID: <span className="font-mono">{userId || 'Loading...'}</span></p>
      </div>
    );
  };


  // Component to handle creating a new game
  const CreateGame = () => {
    // Destructure necessary values from the Firebase context
    const { db, userId, isAuthReady, setDisplayName, setCurrentGameId, setCurrentPage } = useFirebase();
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleCreateGame = async () => {
      if (!name.trim()) {
        setErrorMessage('Please enter your name.');
        return;
      }
      if (!isAuthReady || !userId) {
        setErrorMessage('Authentication not ready. Please wait.');
        return;
      }

      setCreating(true);
      setErrorMessage('');
      try {
        const newGameCode = generateGameCode();
        const gameRef = doc(db, `artifacts/${appId}/public/data/games`, newGameCode);

        // Check if game code already exists (unlikely but possible)
        const gameSnap = await getDoc(gameRef);
        if (gameSnap.exists()) {
          // If it exists, try again or generate a new code. For now, just log and return.
          console.warn("Generated duplicate game code, trying again.");
          setErrorMessage("Failed to create game, please try again.");
          setCreating(false);
          return;
        }

        const initialGameData = {
          hostId: userId,
          players: [{ id: userId, name: name.trim(), status: 'joined' }],
          currentRound: 0,
          status: 'lobby', // 'lobby', 'playing', 'finished'
          createdAt: Date.now(),
        };

        await setDoc(gameRef, initialGameData);
        setCurrentGameId(newGameCode);
        setCurrentPage('gameLobby');
        setDisplayName(name.trim()); // Set display name globally
        console.log(`Game created with code: ${newGameCode}`);
      } catch (error) {
        console.error("Error creating game:", error);
        setErrorMessage("Failed to create game. Please try again.");
      } finally {
        setCreating(false);
      }
    };

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Create New Game</h2>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleCreateGame}
          disabled={creating || !isAuthReady}
          className={`w-full p-3 rounded-md text-lg font-semibold transition duration-300 ${
            creating || !isAuthReady ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
          }`}
        >
          {creating ? 'Creating...' : 'Create Game'}
        </button>
        {errorMessage && <p className="text-red-500 mt-4 text-sm">{errorMessage}</p>}
        <button
          onClick={() => setCurrentPage('home')}
          className="mt-4 text-indigo-600 hover:underline text-sm"
        >
          Back to Home
        </button>
      </div>
    );
  };

  // Component to handle joining an existing game
  const JoinGame = () => {
    // Destructure necessary values from the Firebase context
    const { db, userId, isAuthReady, setDisplayName, setCurrentGameId, setCurrentPage } = useFirebase();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [joining, setJoining] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleJoinGame = async () => {
      if (!name.trim()) {
        setErrorMessage('Please enter your name.');
        return;
      }
      if (!code.trim()) {
        setErrorMessage('Please enter a game code.');
        return;
      }
      if (!isAuthReady || !userId) {
        setErrorMessage('Authentication not ready. Please wait.');
        return;
      }

      setJoining(true);
      setErrorMessage('');
      try {
        const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, code.trim().toUpperCase());
        const gameSnap = await getDoc(gameDocRef);

        if (!gameSnap.exists()) {
          setErrorMessage('Game not found. Please check the code.');
          return;
        }

        const gameData = gameSnap.data();
        // Check if player already exists in the game
        const playerExists = gameData.players.some(player => player.id === userId);

        if (!playerExists) {
          const updatedPlayers = [...gameData.players, { id: userId, name: name.trim(), status: 'joined' }];
          await updateDoc(gameDocRef, { players: updatedPlayers });
        } else {
          // If player exists but name might be different, update it
          const updatedPlayers = gameData.players.map(player =>
            player.id === userId ? { ...player, name: name.trim() } : player
          );
          await updateDoc(gameDocRef, { players: updatedPlayers });
        }

        setCurrentGameId(code.trim().toUpperCase());
        setCurrentPage('gameLobby');
        setDisplayName(name.trim()); // Set display name globally
        console.log(`Joined game: ${code.trim().toUpperCase()}`);
      } catch (error) {
        console.error("Error joining game:", error);
        setErrorMessage("Failed to join game. Please try again.");
      } finally {
        setJoining(false);
      }
    };

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-6">Join Existing Game</h2>
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="text"
          placeholder="Game Code (e.g., ABCDEF)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full p-3 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          maxLength="6"
        />
        <button
          onClick={handleJoinGame}
          disabled={joining || !isAuthReady}
          className={`w-full p-3 rounded-md text-lg font-semibold transition duration-300 ${
            joining || !isAuthReady ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-md'
          }`}
        >
          {joining ? 'Joining...' : 'Join Game'}
        </button>
        {errorMessage && <p className="text-red-500 mt-4 text-sm">{errorMessage}</p>}
        <button
          onClick={() => setCurrentPage('home')}
          className="mt-4 text-green-600 hover:underline text-sm"
        >
          Back to Home
        </button>
      </div>
    );
  };

  // Component for the game lobby
  const GameLobby = () => {
    // Destructure necessary values from the Firebase context
    const { db, userId, game, currentGameId, setCurrentPage } = useFirebase();
    const [message, setMessage] = useState('');
    const [showConfirmationModal, setShowConfirmationModal] = useState(false); // New state for modal
    const isHost = game && game.hostId === userId;

    const handleStartGame = async () => {
      if (!game || !db || !currentGameId) return;

      const activePlayers = game.players.filter(p => p.status === 'joined');
      if (activePlayers.length < 2) {
        setMessage('Need at least 2 players to start the game.');
        return;
      }
      // Removed the odd number check for players for simplicity,
      // as the next round logic now handles 'bye' players.
      // A message is shown if it's an odd number.

      setMessage('Starting game...');
      try {
        // Shuffle players for fair initial pairing
        const shuffledPlayers = [...activePlayers].sort(() => 0.5 - Math.random());
        const initialMatches = [];
        const nextRoundPlayers = shuffledPlayers.map(p => ({ ...p, advancedThisRound: false, wins: 0, losses: 0, status: 'playing' }));

        // Handle bye: if odd number, one player gets a bye
        let byePlayer = null;
        if (nextRoundPlayers.length % 2 !== 0) {
          byePlayer = nextRoundPlayers.pop(); // Take one player out for a bye
          if (byePlayer) {
            byePlayer.advancedThisRound = true; // Bye player automatically advances
            console.log(`${byePlayer.name} gets a bye this round.`);
          }
        }

        for (let i = 0; i < nextRoundPlayers.length; i += 2) {
          const player1 = nextRoundPlayers[i];
          const player2 = nextRoundPlayers[i + 1];

          // Create a new match document in a subcollection
          const matchRef = doc(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
          const newMatchData = {
            id: matchRef.id,
            round: 1,
            player1: { id: player1.id, name: player1.name, score: 0, move: null, lastMoveTime: null },
            player2: { id: player2.id, name: player2.name, score: 0, move: null, lastMoveTime: null },
            status: 'active', // 'active', 'finished'
            winnerId: null,
            loserId: null,
            gamesPlayed: 0, // Number of individual RPS games played within this match
          };
          await setDoc(matchRef, newMatchData);
          initialMatches.push(matchRef.id);
        }

        const finalPlayersForRound1 = byePlayer ? [...nextRoundPlayers, byePlayer] : nextRoundPlayers;

        await updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), {
          status: 'playing',
          currentRound: 1,
          matches: initialMatches, // Store match IDs for the current round
          players: finalPlayersForRound1, // Reset scores and status for players
        });
        setMessage('');
        console.log("Game started! Initial matches created.");
        setCurrentPage('tournament');
      } catch (error) {
        console.error("Error starting game:", error);
        setMessage('Failed to start game. ' + error.message);
      }
    };

    // Function called when the user initiates leaving the game (button click)
    const handleLeaveGameInitiate = () => {
      if (isHost) {
        setShowConfirmationModal(true); // Show modal for host confirmation
      } else {
        // Non-host players can leave directly
        handleLeaveGameConfirm();
      }
    };

    // Function called after host confirms leaving via modal
    const handleLeaveGameConfirm = async () => {
      setShowConfirmationModal(false); // Hide the modal

      if (!db || !currentGameId || !userId || !game) {
        setMessage("Error: Cannot leave game. Missing data.");
        return;
      }

      try {
        if (isHost) {
          // Delete all matches in the subcollection first
          const matchesSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
          const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);

          // Then delete the game document
          await deleteDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId));
          console.log("Game deleted by host.");
        } else {
          // If a player leaves, update the player list
          const updatedPlayers = game.players.filter(player => player.id !== userId);
          await updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), { players: updatedPlayers });
          console.log("Left the game.");
        }
        setCurrentGameId(null);
        setGame(null);
        setCurrentPage('home');
      } catch (error) {
        console.error("Error leaving game:", error);
        setMessage("Failed to leave game. Please try again.");
      }
    };

    if (!game) {
      return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
          <p className="text-xl text-gray-700">Loading game data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-full lg:w-2/3 mx-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">Game Lobby</h2>
        <p className="text-xl text-gray-600 mb-6">Game Code: <span className="font-extrabold text-indigo-600 text-4xl">{currentGameId}</span></p>
        <p className="text-lg text-gray-700 mb-4">Your ID: <span className="text-sm font-mono text-gray-500">{userId}</span></p>


        <div className="w-full max-w-md bg-gray-50 p-4 rounded-md shadow-inner mb-6">
          <h3 className="text-2xl font-semibold text-gray-700 mb-3">Players Joined:</h3>
          {game.players && game.players.length > 0 ? (
            <ul className="space-y-2">
              {game.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between bg-white p-3 rounded-md shadow-sm">
                  <span className="text-lg font-medium text-gray-800">{player.name}</span>
                  <span className="text-sm text-gray-500">{player.id === userId ? "(You)" : ""}</span>
                  {player.id === game.hostId && <span className="text-xs font-bold text-indigo-500">Host</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No players yet. Share the code!</p>
          )}
        </div>

        {isHost && game.status === 'lobby' && (
          <button
            onClick={handleStartGame}
            className="w-full max-w-xs p-4 rounded-md text-xl font-bold transition duration-300 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
          >
            Start Tournament
          </button>
        )}
        {!isHost && game.status === 'lobby' && (
           <p className="text-center text-lg text-gray-700 mt-4">Waiting for the host to start the game...</p>
        )}

        {message && <p className="text-red-500 mt-4 text-sm text-center">{message}</p>}
        <button
          onClick={handleLeaveGameInitiate}
          className="mt-6 p-3 rounded-md text-md font-semibold transition duration-300 bg-red-500 hover:bg-red-600 text-white shadow-md"
        >
          {isHost ? 'Delete Game & Go Home' : 'Leave Game'}
        </button>

        {/* Confirmation Modal */}
        <ConfirmationModal
          show={showConfirmationModal}
          title="Confirm Game Deletion"
          message="As the host, if you delete this game, it will be removed for everyone. This action cannot be undone."
          onConfirm={handleLeaveGameConfirm}
          onCancel={() => setShowConfirmationModal(false)}
        />
      </div>
    );
  };

  // Component for the actual tournament play
  const TournamentGame = () => {
    // Destructure necessary values from the Firebase context
    const { db, userId, game, currentGameId, displayName, setCurrentGameId, setGame, setCurrentPage } = useFirebase();
    const [matches, setMatches] = useState([]);
    const [currentMatchId, setCurrentMatchId] = useState(null); // The ID of the match this user is currently in
    const [message, setMessage] = useState('');
    const [showGameEndedModal, setShowGameEndedModal] = useState(false);
    const [finalWinner, setFinalWinner] = useState(null);
    const [showResetConfirmation, setShowResetConfirmation] = useState(false);
    const [showEndGameConfirmation, setShowEndGameConfirmation] = useState(false);


    const currentPlayer = game?.players.find(p => p.id === userId);
    const isHost = game?.hostId === userId;

    // Listen to all matches in the current game
    useEffect(() => {
      if (db && currentGameId && game?.status === 'playing') {
        const matchesColRef = collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`);
        const q = query(matchesColRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const updatedMatches = snapshot.docs.map(doc => doc.data());
          setMatches(updatedMatches);

          // Determine the user's current match
          const userMatch = updatedMatches.find(match =>
            match.status === 'active' &&
            (match.player1.id === userId || match.player2.id === userId)
          );
          if (userMatch) {
            setCurrentMatchId(userMatch.id);
          } else {
            setCurrentMatchId(null); // User is not in an active match
          }

          // Check if tournament has a winner
          if (game.status === 'playing') { // Only check if still playing
            const activePlayers = game.players.filter(p => p.status === 'playing');
            if (activePlayers.length === 1 && game.currentRound > 0) {
              setFinalWinner(activePlayers[0]);
              setShowGameEndedModal(true);
              // Update game status to 'finished' in Firestore if it's not already
              if (game.status !== 'finished') {
                updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), { status: 'finished' });
              }
            } else if (activePlayers.length === 0 && game.currentRound > 0) {
              // All players eliminated, but no single winner (e.g., all left)
              setFinalWinner(null); // No specific winner
              setShowGameEndedModal(true);
              if (game.status !== 'finished') {
                 updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), { status: 'finished' });
              }
            }
          }

        }, (error) => {
          console.error("Error listening to matches:", error);
        });

        return () => unsubscribe();
      }
    }, [db, currentGameId, game?.status, game?.players]); // Depend on game.status to react to game ending

    const handleMakeMove = async (move) => {
      if (!currentMatchId || !db || !userId) return;

      setMessage('');
      const matchDocRef = doc(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`, currentMatchId);
      const matchSnap = await getDoc(matchDocRef);

      if (!matchSnap.exists()) {
        setMessage('Error: Match not found.');
        return;
      }

      const matchData = matchSnap.data();
      const isPlayer1 = matchData.player1.id === userId;

      let updateData = {};
      if (isPlayer1) {
        if (matchData.player1.move) {
          setMessage("You've already made your move for this round.");
          return;
        }
        updateData = { 'player1.move': move, 'player1.lastMoveTime': Date.now() };
      } else {
        if (matchData.player2.move) {
          setMessage("You've already made your move for this round.");
          return;
        }
        updateData = { 'player2.move': move, 'player2.lastMoveTime': Date.now() };
      }

      try {
        await updateDoc(matchDocRef, updateData);
        setMessage('Move submitted! Waiting for opponent...');
      } catch (error) {
        console.error("Error making move:", error);
        setMessage('Failed to submit move.');
      }
    };

    // Effect to check match results when a match updates
    useEffect(() => {
      if (db && currentGameId && currentMatchId) {
        const unsubscribe = onSnapshot(doc(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`, currentMatchId), async (matchSnap) => {
          if (!matchSnap.exists()) return;

          const matchData = matchSnap.data();
          if (matchData.player1.move && matchData.player2.move && matchData.status === 'active') {
            const p1Move = matchData.player1.move;
            const p2Move = matchData.player2.move;
            let winnerOfGame = null; // Winner of this single RPS game
            let p1Score = matchData.player1.score;
            let p2Score = matchData.player2.score;
            let currentGamesPlayed = matchData.gamesPlayed + 1;

            if (p1Move === p2Move) {
              setMessage("It's a tie! Play again.");
            } else if (
              (p1Move === 'rock' && p2Move === 'scissors') ||
              (p1Move === 'paper' && p2Move === 'rock') ||
              (p1Move === 'scissors' && p2Move === 'paper')
            ) {
              winnerOfGame = matchData.player1.id;
              p1Score++;
              setMessage(`${matchData.player1.name} wins this game!`);
            } else {
              winnerOfGame = matchData.player2.id;
              p2Score++;
              setMessage(`${matchData.player2.name} wins this game!`);
            }

            // Update scores and reset moves for the next individual game
            const updates = {
              'player1.score': p1Score,
              'player2.score': p2Score,
              'player1.move': null, // Reset moves for next game
              'player2.move': null,
              'player1.lastMoveTime': null,
              'player2.lastMoveTime': null,
              gamesPlayed: currentGamesPlayed,
            };

            // Check if match winner (first to 3 games)
            let matchWinnerId = null;
            let matchLoserId = null;
            let matchStatus = 'active';

            if (p1Score >= 3) {
              matchWinnerId = matchData.player1.id;
              matchLoserId = matchData.player2.id;
              matchStatus = 'finished';
              setMessage(`${matchData.player1.name} wins the match! Advancing...`);
            } else if (p2Score >= 3) {
              matchWinnerId = matchData.player2.id;
              matchLoserId = matchData.player1.id;
              matchStatus = 'finished';
              setMessage(`${matchData.player2.name} wins the match! Advancing...`);
            }

            updates.status = matchStatus;
            updates.winnerId = matchWinnerId;
            updates.loserId = matchLoserId;

            await updateDoc(doc(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`, currentMatchId), updates);

            // If a match finishes, update player status in the main game document
            if (matchStatus === 'finished' && matchWinnerId && matchLoserId) {
              const gameDocRef = doc(db, `artifacts/${appId}/public/data/games`, currentGameId);
              const gameSnap = await getDoc(gameDocRef);
              const gameData = gameSnap.data();

              const updatedPlayers = gameData.players.map(p => {
                if (p.id === matchWinnerId) {
                  return { ...p, advancedThisRound: true, wins: (p.wins || 0) + 1 };
                } else if (p.id === matchLoserId) {
                  return { ...p, status: 'eliminated', losses: (p.losses || 0) + 1 };
                }
                return p;
              });
              await updateDoc(gameDocRef, { players: updatedPlayers });
            }
          }
        });
        return () => unsubscribe();
      }
    }, [db, currentGameId, currentMatchId, userId]);


    // Host-specific logic to advance to the next round
    const handleNextRound = async () => {
      if (!isHost || !db || !currentGameId || !game) return;

      const currentRound = game.currentRound;
      const playersInCurrentRound = game.players.filter(p => p.status === 'playing' && p.advancedThisRound);

      if (playersInCurrentRound.length < 1) { // If everyone eliminated or no one advanced
        setMessage("No players advanced, or all players eliminated. Game might be over or needs more players.");
        return;
      }
      if (playersInCurrentRound.length === 1) {
        setMessage(`Tournament Winner: ${playersInCurrentRound[0].name}!`);
        setFinalWinner(playersInCurrentRound[0]);
        setShowGameEndedModal(true);
        await updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), {
          status: 'finished',
        });
        return;
      }
      // Removed the odd number check for players for simplicity,
      // as the next round logic now handles 'bye' players.
      // A message is shown if it's an odd number.


      setMessage(`Starting Round ${currentRound + 1}...`);
      try {
        // Clear previous round's matches
        const prevMatchesSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = prevMatchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        console.log("Previous round matches cleared.");

        // Shuffle players for fair pairing
        const shuffledPlayers = [...playersInCurrentRound].sort(() => 0.5 - Math.random());
        const nextRoundMatches = [];
        const nextRoundPlayers = shuffledPlayers.map(p => ({ ...p, advancedThisRound: false })); // Reset advanced status

        // Handle bye: if odd number, one player gets a bye
        let byePlayer = null;
        if (nextRoundPlayers.length % 2 !== 0) {
          byePlayer = nextRoundPlayers.pop(); // Take one player out for a bye
          if (byePlayer) {
            byePlayer.advancedThisRound = true; // Bye player automatically advances
            console.log(`${byePlayer.name} gets a bye this round.`);
          }
        }

        for (let i = 0; i < nextRoundPlayers.length; i += 2) {
          const player1 = nextRoundPlayers[i];
          const player2 = nextRoundPlayers[i + 1];

          const matchRef = doc(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
          const newMatchData = {
            id: matchRef.id,
            round: currentRound + 1,
            player1: { id: player1.id, name: player1.name, score: 0, move: null, lastMoveTime: null },
            player2: { id: player2.id, name: player2.name, score: 0, move: null, lastMoveTime: null },
            status: 'active',
            winnerId: null,
            loserId: null,
            gamesPlayed: 0,
          };
          await setDoc(matchRef, newMatchData);
          nextRoundMatches.push(matchRef.id);
        }

        const finalPlayersForNextRound = byePlayer ? [...nextRoundPlayers, byePlayer] : nextRoundPlayers;

        await updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), {
          currentRound: currentRound + 1,
          matches: nextRoundMatches,
          players: finalPlayersForNextRound, // Update players list for next round
        });

        setMessage('');
        console.log(`Round ${currentRound + 1} started.`);
      } catch (error) {
        console.error("Error advancing to next round:", error);
        setMessage('Failed to start next round: ' + error.message);
      }
    };


    const currentMatch = matches.find(m => m.id === currentMatchId);
    const opponent = currentMatch
      ? (currentMatch.player1.id === userId ? currentMatch.player2 : currentMatch.player1)
      : null;
    const self = currentMatch
      ? (currentMatch.player1.id === userId ? currentMatch.player1 : currentMatch.player2)
      : null;

    const allMatchesFinished = game?.matches?.every(matchId => {
      const match = matches.find(m => m.id === matchId);
      return match && match.status === 'finished';
    });

    const playersInTournament = game?.players.filter(p => p.status === 'playing' || p.status === 'eliminated').length || 0;
    const playersRemaining = game?.players.filter(p => p.status === 'playing').length || 0;


    // Filter players to show for scoreboard in current round
    const scoreboardPlayers = game?.players
      .filter(p => p.status === 'playing' || p.status === 'eliminated')
      .sort((a, b) => {
        // Sort by 'playing' first, then 'eliminated', then by wins (desc)
        if (a.status === 'playing' && b.status !== 'playing') return -1;
        if (a.status !== 'playing' && b.status === 'playing') return 1;
        return (b.wins || 0) - (a.wins || 0);
      });

    // Handle initiation of going back to lobby (host only)
    const handleBackToLobbyInitiate = () => {
      if (isHost) {
        setShowResetConfirmation(true);
      } else {
        // Non-host just navigates back
        handleBackToLobbyConfirm();
      }
    };

    const handleBackToLobbyConfirm = async () => {
      setShowResetConfirmation(false); // Hide modal

      if (!db || !currentGameId || !userId || !game) {
        setMessage("Error: Cannot reset game. Missing data.");
        return;
      }

      try {
        // Delete all matches in the subcollection first
        const matchesSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // Reset game status and player states in main game document
        await updateDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId), {
          status: 'lobby',
          currentRound: 0,
          matches: [],
          players: game.players.map(p => ({ ...p, status: 'joined', wins: 0, losses: 0, advancedThisRound: false })),
        });
        console.log("Game reset to lobby state by host.");

        setCurrentPage('gameLobby');
      } catch (error) {
        console.error("Error going back to lobby:", error);
        setMessage("Failed to go back to lobby.");
      }
    };

    const handleEndGameInitiate = () => {
      if (isHost) {
        setShowEndGameConfirmation(true);
      }
    };

    const handleEndGameConfirm = async () => {
      setShowEndGameConfirmation(false); // Hide modal

      if (!db || !currentGameId || !game) {
        setMessage("Error: Cannot end game. Missing data.");
        return;
      }

      try {
        // Delete all matches in the subcollection first
        const matchesSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // Delete the game document itself
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/games`, currentGameId));
        console.log("Game deleted after ending.");
        setCurrentGameId(null);
        setGame(null);
        setCurrentPage('home');
      } catch (error) {
        console.error("Error ending game:", error);
        setMessage("Failed to end game.");
      }
    };


    if (!game) {
      return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
          <p className="text-xl text-gray-700">Loading tournament data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-full lg:w-2/3 mx-auto relative overflow-hidden">
        <h2 className="text-4xl font-extrabold text-gray-900 mb-2">Tournament</h2>
        <p className="text-xl text-indigo-600 mb-6">Round: {game.currentRound}</p>
        <p className="text-lg text-gray-700 mb-4">You are: <span className="font-semibold text-xl">{displayName || 'Anonymous'}</span> (ID: <span className="text-sm font-mono text-gray-500">{userId}</span>)</p>

        {game.status === 'finished' && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl text-center animate-bounce-in">
              <h3 className="text-5xl font-extrabold text-yellow-500 mb-4">🏆 Tournament Ended! 🏆</h3>
              {finalWinner ? (
                <p className="text-4xl font-bold text-green-700 mb-6">{finalWinner.name} is the Champion!</p>
              ) : (
                <p className="text-4xl font-bold text-gray-700 mb-6">No clear winner (e.g., game reset or all left).</p>
              )}

              {isHost && (
                <button
                  onClick={handleEndGameInitiate}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300"
                >
                  End Game Completely
                </button>
              )}
              {!isHost && (
                <button
                  onClick={() => {
                    setCurrentGameId(null);
                    setGame(null);
                    setCurrentPage('home');
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300"
                >
                  Go Home
                </button>
              )}
            </div>
          </div>
        )}

        {currentMatch ? (
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-xl shadow-lg w-full max-w-md mb-6 transform hover:scale-105 transition duration-300">
            <h3 className="text-2xl font-bold mb-3 text-center">Your Match</h3>
            <div className="flex justify-between items-center text-xl font-semibold mb-4">
              <span className="flex-1 text-center">{self.name} <br/> ({self.score})</span>
              <span className="mx-4 text-3xl">VS</span>
              <span className="flex-1 text-center">{opponent.name} <br/> ({opponent.score})</span>
            </div>
            <p className="text-center text-sm mb-4">First to 3 wins the match!</p>

            <div className="flex justify-around mt-4">
              {['rock', 'paper', 'scissors'].map((move) => (
                <button
                  key={move}
                  onClick={() => handleMakeMove(move)}
                  disabled={self.move !== null || currentMatch.status !== 'active' || game.status !== 'playing'}
                  className={`p-4 rounded-full text-4xl shadow-md transition duration-300 transform hover:scale-110
                    ${self.move === move ? 'bg-yellow-400' : 'bg-white text-indigo-700 hover:bg-gray-200'}
                    ${self.move !== null || currentMatch.status !== 'active' || game.status !== 'playing' ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  title={`Play ${move}`}
                >
                  {move === 'rock' && '✊'}
                  {move === 'paper' && '✋'}
                  {move === 'scissors' && '✌️'}
                </button>
              ))}
            </div>
            {self.move && <p className="text-center mt-4 text-xl font-semibold">You played: <span className="capitalize">{self.move}</span></p>}
            {opponent.move && <p className="text-center mt-2 text-xl font-semibold">Opponent played: <span className="capitalize">{opponent.move}</span></p>}
          </div>
        ) : (
          <div className="bg-gray-100 p-6 rounded-xl shadow-inner w-full max-w-md mb-6">
            <h3 className="text-2xl font-bold text-gray-700 mb-3 text-center">Waiting for Next Match...</h3>
            <p className="text-center text-gray-600">
              {currentPlayer?.status === 'eliminated' ? (
                "You have been eliminated from the tournament. Thanks for playing!"
              ) : currentPlayer?.advancedThisRound ? (
                "You won your match! Waiting for the next round to start."
              ) : (
                "Waiting for your match to be assigned or for the host to start the next round."
              )}
            </p>
          </div>
        )}

        {message && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 w-full max-w-md rounded-md shadow mb-6" role="alert">
            <p className="font-bold">Info</p>
            <p>{message}</p>
          </div>
        )}

        <div className="w-full max-w-lg bg-gray-50 p-6 rounded-lg shadow-inner mb-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">Tournament Scoreboard</h3>
          <ul className="space-y-3">
            {scoreboardPlayers.map(player => (
              <li key={player.id} className={`flex justify-between items-center p-3 rounded-md shadow-sm
                ${player.status === 'playing' ? 'bg-blue-100 border-l-4 border-blue-500' : 'bg-gray-200 opacity-75'}
                ${player.id === userId ? 'ring-2 ring-purple-500' : ''}
              `}>
                <span className="font-semibold text-lg text-gray-900 flex-grow">{player.name} {player.id === userId && '(You)'}</span>
                <span className="text-gray-700 text-sm italic mr-4">({player.id})</span>
                <span className="font-bold text-xl">
                  {player.status === 'eliminated' ? '🚫 Eliminated' : `🏆 ${(player.wins || 0)} wins`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {isHost && allMatchesFinished && playersRemaining > 1 && game.status === 'playing' && (
          <button
            onClick={handleNextRound}
            className="w-full max-w-xs p-4 rounded-md text-xl font-bold transition duration-300 bg-blue-600 hover:bg-blue-700 text-white shadow-lg mt-6"
          >
            Start Next Round
          </button>
        )}

        {isHost && (playersRemaining === 1 || game.status === 'finished') && (
            <button
              onClick={handleEndGameInitiate}
              className="w-full max-w-xs p-4 rounded-md text-xl font-bold transition duration-300 bg-red-600 hover:bg-red-700 text-white shadow-lg mt-6"
            >
              End Tournament
            </button>
        )}

        {!isHost && (playersRemaining === 1 || game.status === 'finished') && (
          <p className="mt-6 text-center text-lg text-gray-700">The tournament has ended. Waiting for the host to finalize the game.</p>
        )}
        <button
          onClick={handleBackToLobbyInitiate}
          className="mt-6 p-3 rounded-md text-md font-semibold transition duration-300 bg-gray-500 hover:bg-gray-600 text-white shadow-md"
          disabled={game.status === 'finished' && !isHost}
        >
          {isHost ? 'Reset Game to Lobby' : 'Back to Lobby'}
        </button>

        {/* Confirmation Modals for TournamentGame */}
        <ConfirmationModal
          show={showResetConfirmation}
          title="Confirm Game Reset"
          message="As the host, if you reset this game to the lobby, all current tournament progress and matches will be cleared. Players will return to the lobby."
          onConfirm={handleBackToLobbyConfirm}
          onCancel={() => setShowResetConfirmation(false)}
        />
        <ConfirmationModal
          show={showEndGameConfirmation}
          title="Confirm Tournament End"
          message="As the host, if you end this tournament, the game will be permanently deleted for everyone. This cannot be undone."
          onConfirm={handleEndGameConfirm}
          onCancel={() => setShowEndGameConfirmation(false)}
        />
      </div>
    );
  };


  // Main render logic for App component
  // Provide all necessary state and setters via FirebaseContext
  return (
    <FirebaseContext.Provider value={{
      db, auth, userId, setUserId, displayName, setDisplayName,
      isAuthReady, appId, currentPage, setCurrentPage, currentGameId, setCurrentGameId, game, setGame
    }}>
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        {
          (() => {
            switch (currentPage) {
              case 'home':
                return <Home />;
              case 'createGame':
                return <CreateGame />;
              case 'joinGame':
                return <JoinGame />;
              case 'gameLobby':
                return <GameLobby />;
              case 'tournament':
                return <TournamentGame />;
              default:
                return <Home />; // Fallback
            }
          })()
        }
      </div>
    </FirebaseContext.Provider>
  );
};

export default App;
