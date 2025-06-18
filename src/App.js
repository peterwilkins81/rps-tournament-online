import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, deleteDoc, getDocs } from 'firebase/firestore';

// 1. Firebase Context for global access to DB, Auth, and user state
const FirebaseContext = createContext(null);

// Custom hook to consume the Firebase context
const useFirebase = () => useContext(FirebaseContext);

// 2. Utility Function: Generate a short, unique 5-letter game code
const generateGameCode = () => {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charactersLength = characters.length;
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// 3. Reusable UI Component: Confirmation Modal (instead of alert/confirm)
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

// 4. Reusable UI Component: Player Status Modal
const PlayerStatusModal = ({ show, onClose, players, matches, currentUserId }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-2xl max-w-md w-full text-center">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Current Player Status</h3>
        <ul className="space-y-3 mb-6 text-left">
          {players.map(player => {
            const isInActiveMatch = matches.some(match =>
              match.status === 'active' &&
              (match.player1.id === player.id || match.player2.id === player.id)
            );
            const playerMatch = matches.find(match =>
                match.status === 'active' &&
                (match.player1.id === player.id || match.player2.id === player.id)
            );
            const playerInMatchData = playerMatch ? (playerMatch.player1.id === player.id ? playerMatch.player1 : playerMatch.player2) : null;

            let statusText = '';
            let moveStatusText = '';

            if (player.status === 'eliminated') {
              statusText = 'Eliminated from Tournament';
            } else if (player.advancedThisRound && !isInActiveMatch) {
              statusText = 'Received a Bye (Advanced to next round)';
            } else if (player.status === 'playing' && isInActiveMatch) {
              statusText = 'In active match';
              if (playerInMatchData?.pendingMove) {
                  moveStatusText = 'Move Chosen';
              } else {
                  moveStatusText = 'Waiting for Move';
              }
            } else if (player.status === 'playing' && !isInActiveMatch) {
                statusText = 'Waiting for match assignment'; // Should happen if waiting for next round
            } else {
                statusText = 'Joined (Lobby)';
            }

            return (
              <li key={player.id} className="bg-gray-100 p-3 rounded-md border border-gray-200">
                <span className="font-semibold text-lg text-gray-900">{player.name} {player.id === currentUserId && '(You)'}</span>
                <p className="text-sm text-gray-600">Status: <span className="font-medium">{statusText}</span></p>
                {playerMatch && (
                  <p className="text-sm text-gray-600">
                    Match: <span className="font-medium">{playerMatch.player1.name} vs {playerMatch.player2.name}</span>
                    {moveStatusText && <span className="ml-2 font-medium">({moveStatusText})</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button
          onClick={onClose}
          className="w-full p-3 rounded-md font-semibold transition duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
        >
          Close
        </button>
      </div>
    </div>
  );
};


// 5. Main App Component - Orchestrates all other components and Firebase initialization
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [currentGameId, setCurrentGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [finalWinner, setFinalWinner] = useState(null);
  const [showGameEndedModal, setShowGameEndedModal] = useState(false);

  // Firebase Initialization and Authentication - Runs once on component mount
  useEffect(() => {
    try {
      // Hardcoded Firebase Config as requested
      const firebaseConfig = {
        apiKey: "AIzaSyBni6_iiti4MytyRpfTh95SyC1LhyV9KF0",
        authDomain: "rps-tournament-online.firebaseapp.com",
        projectId: "rps-tournament-online",
        storageBucket: "rps-tournament-online.firebasestorage.app",
        messagingSenderId: "453163680831",
        appId: "1:453163680831:web:cb66974cb075122d5fe48a"
      };

      // Essential check to ensure Firebase configuration is valid
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId || !firebaseConfig.apiKey) {
        console.error("Firebase config is missing or empty. Please ensure all Firebase credentials are correct.");
        return; // Prevent initialization with invalid config
      }

      // Initialize Firebase app and get service instances
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      // Listen for authentication state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          console.log("Firebase Auth State Changed: Logged in as", user.uid);
          setUserId(user.uid);
          setDisplayName(user.displayName || user.uid);
          setIsAuthReady(true); // Authentication is ready
        } else {
          console.log("Firebase Auth State Changed: No user, attempting anonymous sign-in.");
          try {
            // Since config is hardcoded, we default to anonymous sign-in here.
            // If you need custom token sign-in, you'd need a different mechanism to provide the token.
            await signInAnonymously(firebaseAuth);
            console.log("Signed in anonymously.");
          } catch (authError) {
            console.error("Error during Firebase anonymous sign-in:", authError);
            setIsAuthReady(true); // Still set ready even if sign-in failed, so app can proceed (e.g., show error)
          }
        }
      });

      // Cleanup function for auth listener
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
    }
  }, []); // Empty dependency array ensures this runs only once

  // Effect to listen to game data when currentGameId changes
  useEffect(() => {
    if (db && currentGameId) {
      // With hardcoded config, appId is directly available
      const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId
      const gameDocRef = doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId);

      const unsubscribeGame = onSnapshot(gameDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const latestGameData = docSnap.data();
          setGame(latestGameData);
          console.log("Current Game Data:", latestGameData);

          // Tournament winner determination logic
          if (latestGameData.status === 'playing') {
            const activePlayers = latestGameData.players.filter(p => p.status === 'playing');
            if (activePlayers.length === 1 && latestGameData.currentRound > 0) {
              const potentialWinner = activePlayers[0];
              if (potentialWinner.advancedThisRound) { // Ensure winner actually advanced from a match
                setFinalWinner(potentialWinner);
                setShowGameEndedModal(true);
                if (latestGameData.status !== 'finished') {
                  updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), { status: 'finished' });
                }
              }
            } else if (activePlayers.length === 0 && latestGameData.currentRound > 0) {
              // All players eliminated or left, and no clear winner
              setFinalWinner(null);
              setShowGameEndedModal(true);
              if (latestGameData.status !== 'finished') {
                updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), { status: 'finished' });
              }
            }
          }

          // Automatically navigate based on game state
          if (latestGameData.status === 'lobby') {
            setCurrentPage('gameLobby');
          } else if (latestGameData.status === 'playing' || latestGameData.status === 'finished') {
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
        if (error.code === 'permission-denied') {
          alert("You do not have permission to access this game. It might have been deleted or the game code is incorrect.");
          setCurrentGameId(null);
          setGame(null);
          setCurrentPage('home');
        }
      });

      // Cleanup function for game listener
      return () => unsubscribeGame();
    }
  }, [db, currentGameId]); // Dependencies ensure listener updates if DB or game ID changes

  // 6. Home Component
  const Home = () => {
    const { userId, isAuthReady, setCurrentPage } = useFirebase();
    // Static timestamp for compilation time
    const compileTimestamp = "June 18, 2025, 03:25 PM BST"; // Updated timestamp

    useEffect(() => {
      console.log("Home component rendered.");
      console.log("Home - isAuthReady:", isAuthReady);
      console.log("Home - userId:", userId);
    }, [isAuthReady, userId]);

    return (
      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg shadow-xl m-4 md:w-1/2 lg:w-1/3 mx-auto">
        <h2 className="text-4xl font-bold text-gray-800 mb-6">Rock, Paper, Scissors Tournament</h2>
        <p className="text-lg text-gray-600 mb-8 text-center">Challenge your friends to an epic tournament!</p>
        <button
          onClick={() => {
            if (!isAuthReady || !userId) {
              alert("Please wait for authentication to be ready before creating a game.");
              return;
            }
            setCurrentPage('createGame');
          }}
          className="w-full p-4 mb-4 rounded-md text-xl font-bold transition duration-300 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
          disabled={!isAuthReady || !userId} // Button disabled until auth is ready and userId exists
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
        <p className="mt-2 text-xs text-gray-400">Version Compiled: {compileTimestamp}</p>
      </div>
    );
  };

  // 7. CreateGame Component
  const CreateGame = () => {
    const { db, userId, isAuthReady, setDisplayName, setCurrentGameId, setCurrentPage } = useFirebase();
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    // With hardcoded config, appId is directly available
    const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

    useEffect(() => {
      console.log("CreateGame component rendered.");
      console.log("CreateGame - isAuthReady:", isAuthReady);
      console.log("CreateGame - userId:", userId);
    }, [isAuthReady, userId]);

    const handleCreateGame = async () => {
      if (!name.trim()) {
        setErrorMessage('Please enter your name.');
        return;
      }
      if (!isAuthReady || !userId) {
        setErrorMessage('Authentication not ready or user ID missing. Please wait, or ensure Firebase Anonymous Auth is enabled.');
        console.error('CreateGame failed: Authentication not ready. isAuthReady:', isAuthReady, 'userId:', userId);
        return;
      }

      setCreating(true);
      setErrorMessage('');
      try {
        const newGameCode = generateGameCode();
        const gameRef = doc(db, `artifacts/${currentAppId}/public/data/games`, newGameCode);

        const gameSnap = await getDoc(gameRef);
        if (gameSnap.exists()) {
          console.warn("Generated duplicate game code, trying again.");
          setErrorMessage("Failed to create game, please try again.");
          return;
        }

        const initialGameData = {
          hostId: userId,
          players: [{ id: userId, name: name.trim(), status: 'joined', wins: 0, losses: 0, advancedThisRound: false }],
          currentRound: 0,
          status: 'lobby',
          createdAt: Date.now(),
        };

        await setDoc(gameRef, initialGameData);
        setCurrentGameId(newGameCode);
        setCurrentPage('gameLobby');
        setDisplayName(name.trim());
        console.log(`Game created with code: ${newGameCode}`);
      } catch (error) {
        console.error("Error creating game:", error);
        setErrorMessage("Failed to create game. Please try again. Error: " + error.message);
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
          disabled={creating || !isAuthReady || !userId}
          className={`w-full p-3 rounded-md text-lg font-semibold transition duration-300 ${
            creating || !isAuthReady || !userId ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
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

  // 8. JoinGame Component
  const JoinGame = () => {
    const { db, userId, isAuthReady, setDisplayName, setCurrentGameId, setCurrentPage } = useFirebase();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [joining, setJoining] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    // With hardcoded config, appId is directly available
    const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

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
        const gameDocRef = doc(db, `artifacts/${currentAppId}/public/data/games`, code.trim().toUpperCase());
        const gameSnap = await getDoc(gameDocRef);

        if (!gameSnap.exists()) {
          setErrorMessage('Game not found. Please check the code.');
          return;
        }

        const gameData = gameSnap.data();
        const playerExists = gameData.players.some(player => player.id === userId);

        if (!playerExists) {
          if (gameData.players.length >= 2) {
            setErrorMessage('Game is full. Cannot join.');
            return;
          }
          const updatedPlayers = [...gameData.players, { id: userId, name: name.trim(), status: 'joined', wins: 0, losses: 0, advancedThisRound: false }];
          await updateDoc(gameDocRef, { players: updatedPlayers });
        } else {
          const updatedPlayers = gameData.players.map(player =>
            player.id === userId ? { ...player, name: name.trim() } : player
          );
          await updateDoc(gameDocRef, { players: updatedPlayers });
        }

        setCurrentGameId(code.trim().toUpperCase());
        setCurrentPage('gameLobby');
        setDisplayName(name.trim());
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
          placeholder="Game Code (e.g., ABCDE)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full p-3 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          maxLength="5"
        />
        <button
          onClick={handleJoinGame}
          disabled={joining || !isAuthReady || !userId}
          className={`w-full p-3 rounded-md text-lg font-semibold transition duration-300 ${
            joining || !isAuthReady || !userId ? 'bg-green-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-md'
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

  // 9. GameLobby Component
  const GameLobby = () => {
    const { db, userId, game, currentGameId, setCurrentPage } = useFirebase();
    const [message, setMessage] = useState('');
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const isHost = game && game.hostId === userId;
    // With hardcoded config, appId is directly available
    const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

    const handleStartGame = async () => {
      if (!game || !db || !currentGameId) return;

      const activePlayers = game.players.filter(p => p.status === 'joined');
      if (activePlayers.length < 2) {
        setMessage('Need at least 2 players to start the game.');
        return;
      }

      setMessage('Starting game...');
      try {
        const shuffledPlayers = [...activePlayers].sort(() => 0.5 - Math.random());
        const initialMatches = [];
        const nextRoundPlayers = shuffledPlayers.map(p => ({ ...p, advancedThisRound: false, wins: 0, losses: 0, status: 'playing' }));

        let byePlayer = null;
        if (nextRoundPlayers.length % 2 !== 0) {
          byePlayer = nextRoundPlayers.pop();
          if (byePlayer) {
            byePlayer.advancedThisRound = true;
            console.log(`${byePlayer.name} gets a bye this round.`);
          }
        }

        for (let i = 0; i < nextRoundPlayers.length; i += 2) {
          const player1 = nextRoundPlayers[i];
          const player2 = nextRoundPlayers[i + 1];

          const matchRef = doc(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
          const newMatchData = {
            id: matchRef.id,
            round: 1,
            player1: { id: player1.id, name: player1.name, score: 0, move: null, pendingMove: null, lastMoveTime: null },
            player2: { id: player2.id, name: player2.name, score: 0, move: null, pendingMove: null, lastMoveTime: null },
            status: 'active',
            winnerId: null,
            loserId: null,
            gamesPlayed: 0,
            gameHistory: [],
          };
          await setDoc(matchRef, newMatchData);
          initialMatches.push(matchRef.id);
        }

        const finalPlayersForRound1 = byePlayer ? [...nextRoundPlayers, byePlayer] : nextRoundPlayers;

        await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), {
          status: 'playing',
          currentRound: 1,
          matches: initialMatches,
          players: finalPlayersForRound1,
        });
        setMessage('');
        console.log("Game started! Initial matches created.");
        setCurrentPage('tournament');
      } catch (error) {
        console.error("Error starting game:", error);
        setMessage('Failed to start game. ' + error.message);
      }
    };

    const handleLeaveGameInitiate = () => {
      if (isHost) {
        setShowConfirmationModal(true);
      } else {
        handleLeaveGameConfirm();
      }
    };

    const handleLeaveGameConfirm = async () => {
      setShowConfirmationModal(false);

      if (!db || !currentGameId || !userId || !game) {
        setMessage("Error: Cannot leave game. Missing data.");
        return;
      }
      const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

      try {
        if (isHost) {
          const matchesSnapshot = await getDocs(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
          const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
          await deleteDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId));
          console.log("Game deleted by host.");
        } else {
          const updatedPlayers = game.players.filter(player => player.id !== userId);
          await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), { players: updatedPlayers });
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

  // 10. TournamentGame Component
  const TournamentGame = () => {
    const { db, userId, game, currentGameId, displayName, setCurrentGameId, setGame, setCurrentPage, finalWinner, setFinalWinner, showGameEndedModal, setShowGameEndedModal } = useFirebase();
    const [matches, setMatches] = useState([]);
    const [currentMatchId, setCurrentMatchId] = useState(null);
    const [message, setMessage] = useState('');
    const [gameResultMessage, setGameResultMessage] = useState('');
    const [showResetConfirmation, setShowResetConfirmation] = useState(false);
    const [showEndGameConfirmation, setShowEndGameConfirmation] = useState(false);
    const [showPlayerStatusModal, setShowPlayerStatusModal] = useState(false);

    const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId
    const currentPlayer = game?.players.find(p => p.id === userId);
    const isHost = game?.hostId === userId;

    // Listen to all matches in the current game's subcollection
    useEffect(() => {
      if (db && currentGameId && game?.status === 'playing') {
        const matchesColRef = collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`);
        const q = query(matchesColRef);

        const unsubscribeMatches = onSnapshot(q, (snapshot) => {
          const updatedMatches = snapshot.docs.map(doc => doc.data());
          setMatches(updatedMatches);

          // Find the current user's active match
          const userMatch = updatedMatches.find(match =>
            match.status === 'active' &&
            (match.player1.id === userId || match.player2.id === userId)
          );
          setCurrentMatchId(userMatch ? userMatch.id : null);
        }, (error) => {
          console.error("Error listening to matches:", error);
        });

        return () => unsubscribeMatches(); // Cleanup listener
      }
    }, [db, currentGameId, game?.status, userId]);

    // Effect to resolve and display match results when moves are made
    useEffect(() => {
      if (db && currentGameId && currentMatchId) {
        const unsubscribeMatchResult = onSnapshot(doc(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`, currentMatchId), async (matchSnap) => {
          if (!matchSnap.exists()) return;

          const matchData = matchSnap.data();
          // Debugging log for current match data
          console.log("Current Match Data for UI:", {
              gamesPlayed: matchData.gamesPlayed,
              gameHistoryLength: matchData.gameHistory?.length,
              player1Move: matchData.player1.move,
              player2Move: matchData.player2.move,
              player1PendingMove: matchData.player1.pendingMove,
              player2PendingMove: matchData.player2.pendingMove,
              status: matchData.status
          });

          if (matchData.player1.pendingMove && matchData.player2.pendingMove && matchData.status === 'active') {
            const p1Move = matchData.player1.pendingMove;
            const p2Move = matchData.player2.pendingMove;
            let winnerOfGameId = null;
            let gameOutcomeMessage = "";
            let p1Score = matchData.player1.score;
            let p2Score = matchData.player2.score;
            let currentGamesPlayed = matchData.gamesPlayed + 1;

            if (p1Move === p2Move) {
              gameOutcomeMessage = "It's a tie!";
            } else if (
              (p1Move === 'rock' && p2Move === 'scissors') ||
              (p1Move === 'paper' && p2Move === 'rock') ||
              (p1Move === 'scissors' && p2Move === 'paper')
            ) {
              winnerOfGameId = matchData.player1.id;
              p1Score++;
              gameOutcomeMessage = `${matchData.player1.name} won!`;
            } else {
              winnerOfGameId = matchData.player2.id;
              p2Score++;
              gameOutcomeMessage = `${matchData.player2.name} won!`;
            }

            setGameResultMessage(gameOutcomeMessage);
            setMessage('');

            const gameResult = {
              gameNum: currentGamesPlayed,
              player1: { name: matchData.player1.name, move: p1Move },
              player2: { name: matchData.player2.name, move: p2Move },
              winner: winnerOfGameId ? (matchData.player1.id === winnerOfGameId ? matchData.player1.name : matchData.player2.name) : 'Tie'
            };
            const newGameHistory = [...(matchData.gameHistory || []), gameResult];

            let matchWinnerId = null;
            let matchLoserId = null;
            let matchStatus = 'active';

            if (p1Score >= 3) { // First to 3 games wins the match
              matchWinnerId = matchData.player1.id;
              matchLoserId = matchData.player2.id;
              matchStatus = 'finished';
              setGameResultMessage(`${matchData.player1.name} wins the match! Advancing...`);
            } else if (p2Score >= 3) {
              matchWinnerId = matchData.player2.id;
              matchLoserId = matchData.player1.id;
              matchStatus = 'finished';
              setGameResultMessage(`${matchData.player2.name} wins the match! Advancing...`);
            }

            await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`, currentMatchId), {
              'player1.score': p1Score,
              'player2.score': p2Score,
              'player1.move': p1Move,
              'player2.move': p2Move,
              gamesPlayed: currentGamesPlayed,
              gameHistory: newGameHistory,
              status: matchStatus,
              winnerId: matchWinnerId,
              loserId: matchLoserId,
            });

            // Clear moves and pending moves after a short delay for display
            setTimeout(async () => {
              if (matchStatus === 'active') { // Only reset if match is still active
                await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`, currentMatchId), {
                  'player1.move': null,
                  'player2.move': null,
                  'player1.pendingMove': null,
                  'player2.pendingMove': null,
                  'player1.lastMoveTime': null,
                  'player2.lastMoveTime': null,
                });
              }
              setGameResultMessage('');
            }, 1500);

            // Update main game document with player status if match finished
            if (matchStatus === 'finished' && matchWinnerId && matchLoserId) {
              const gameDocRef = doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId);
              const gameSnap = await getDoc(gameDocRef);
              const gameData = gameSnap.data();

              const updatedPlayers = gameData.players.map(p => {
                if (p.id === matchWinnerId) {
                  return { ...p, advancedThisRound: true, status: 'playing', wins: (p.wins || 0) + 1 };
                } else if (p.id === matchLoserId) {
                  return { ...p, status: 'eliminated', losses: (p.losses || 0) + 1 };
                }
                return p;
              });
              await updateDoc(gameDocRef, { players: updatedPlayers });
            }
          }
        });
        return () => unsubscribeMatchResult();
      }
    }, [db, currentGameId, currentMatchId, userId]);

    // Function to handle player making a move (rock, paper, or scissors)
    const handleMakeMove = async (move) => {
      if (!currentMatchId || !db || !userId) return;

      setMessage('');
      const matchDocRef = doc(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`, currentMatchId);
      const matchSnap = await getDoc(matchDocRef);

      if (!matchSnap.exists()) {
        setMessage('Error: Match not found.');
        return;
      }

      const matchData = matchSnap.data();
      const isPlayer1 = matchData.player1.id === userId;

      let updateData = {};
      if (isPlayer1) {
        if (matchData.player1.pendingMove) {
          setMessage("You've already made your move for this game.");
          return;
        }
        updateData = { 'player1.pendingMove': move, 'player1.lastMoveTime': Date.now() };
      } else {
        if (matchData.player2.pendingMove) {
          setMessage("You've already made your move for this game.");
          return;
        }
        updateData = { 'player2.pendingMove': move, 'player2.lastMoveTime': Date.now() };
      }

      try {
        await updateDoc(matchDocRef, updateData);
        setMessage('Move submitted! Waiting for opponent...');
      } catch (error) {
        console.error("Error making move:", error);
        setMessage('Failed to submit move.');
      }
    };

    // Host-specific logic to advance to the next round
    const handleNextRound = async () => {
      if (!isHost || !db || !currentGameId || !game) return;

      const currentRound = game.currentRound;
      const playersWhoAdvanced = game.players.filter(p => p.status === 'playing' && p.advancedThisRound);

      if (playersWhoAdvanced.length < 1) {
          setMessage("No players advanced from the previous round. Game might be stuck or over.");
          return;
      }
      if (playersWhoAdvanced.length === 1) {
          setMessage(`Tournament Winner: ${playersWhoAdvanced[0].name}!`);
          setFinalWinner(playersWhoAdvanced[0]);
          setShowGameEndedModal(true);
          await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), { status: 'finished' });
          return;
      }

      setMessage(`Starting Round ${currentRound + 1}...`);
      try {
        const prevMatchesSnapshot = await getDocs(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = prevMatchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        console.log("Previous round matches cleared.");

        const shuffledPlayers = [...playersWhoAdvanced].sort(() => 0.5 - Math.random());
        const nextRoundMatches = [];
        const playersForNextRoundUpdate = shuffledPlayers.map(p => ({ ...p, advancedThisRound: false }));

        let byePlayer = null;
        if (playersForNextRoundUpdate.length % 2 !== 0) {
          byePlayer = playersForNextRoundUpdate.pop();
          if (byePlayer) {
            byePlayer.advancedThisRound = true;
            console.log(`${byePlayer.name} gets a bye this round.`);
          }
        }

        for (let i = 0; i < playersForNextRoundUpdate.length; i += 2) {
          const player1 = playersForNextRoundUpdate[i];
          const player2 = playersForNextRoundUpdate[i + 1];

          const matchRef = doc(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
          const newMatchData = {
            id: matchRef.id,
            round: currentRound + 1,
            player1: { id: player1.id, name: player1.name, score: 0, move: null, pendingMove: null, lastMoveTime: null },
            player2: { id: player2.id, name: player2.name, score: 0, move: null, pendingMove: null, lastMoveTime: null },
            status: 'active',
            winnerId: null,
            loserId: null,
            gamesPlayed: 0,
            gameHistory: [],
          };
          await setDoc(matchRef, newMatchData);
          nextRoundMatches.push(matchRef.id);
        }

        const finalPlayersForNextRound = byePlayer ? [...playersForNextRoundUpdate, byePlayer] : playersForNextRoundUpdate;

        await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), {
          currentRound: currentRound + 1,
          matches: nextRoundMatches,
          players: finalPlayersForNextRound,
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

    const allCurrentRoundMatchesAreFinished = game?.matches?.every(matchId => {
        const match = matches.find(m => m.id === matchId);
        return match && match.status === 'finished';
    }) || false;
    const playersRemaining = game?.players.filter(p => p.status === 'playing').length || 0;

    const scoreboardPlayers = game?.players
      .filter(p => p.status === 'playing' || p.status === 'eliminated' || p.status === 'joined')
      .sort((a, b) => {
        if (a.status === 'playing' && b.status !== 'playing') return -1;
        if (a.status !== 'playing' && b.status === 'playing') return 1;
        return (b.wins || 0) - (a.wins || 0);
      });

    const disableChoiceButtons = self?.pendingMove !== null || currentMatch?.status !== 'active' || game?.status !== 'playing' || gameResultMessage !== '';

    const handleBackToLobbyInitiate = () => {
      if (isHost) {
        setShowResetConfirmation(true);
      } else {
        handleBackToLobbyConfirm();
      }
    };

    const handleBackToLobbyConfirm = async () => {
      setShowResetConfirmation(false);

      if (!db || !currentGameId || !userId || !game) {
        setMessage("Error: Cannot reset game. Missing data.");
        return;
      }
      const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

      try {
        const matchesSnapshot = await getDocs(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        await updateDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId), {
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
      setShowEndGameConfirmation(false);

      if (!db || !currentGameId || !game) {
        setMessage("Error: Cannot end game. Missing data.");
        return;
      }
      const currentAppId = "1:453163680831:web:cb66974cb075122d5fe48a"; // Hardcoded appId

      try {
        const matchesSnapshot = await getDocs(collection(db, `artifacts/${currentAppId}/public/data/games/${currentGameId}/matches`));
        const deletePromises = matchesSnapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, `artifacts/${currentAppId}/public/data/games`, currentGameId));
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
            <p className="text-center text-sm mb-2">(Individual RPS games within this match)</p> {/* Added clarification */}
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
                  disabled={disableChoiceButtons}
                  className={`p-4 rounded-full text-4xl shadow-md transition duration-300 transform hover:scale-110
                    ${self.pendingMove === move ? 'bg-yellow-400' : 'bg-white text-indigo-700 hover:bg-gray-200'}
                    ${disableChoiceButtons ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  title={`Play ${move}`}
                >
                  {move === 'rock' && '✊'}
                  {move === 'paper' && '✋'}
                  {move === 'scissors' && '✌️'}
                </button>
              ))}
            </div>

            {gameResultMessage && (
              <p className="text-center mt-4 text-2xl font-bold text-yellow-300 animate-fade-in-out">
                {gameResultMessage}
              </p>
            )}

            {!gameResultMessage && (
              <>
                {self.pendingMove ? (
                  <p className="text-center mt-4 text-xl font-semibold">You chose: <span className="capitalize">{self.pendingMove}</span> (Waiting for opponent)</p>
                ) : self.move ? (
                  <p className="text-center mt-4 text-xl font-semibold">You played: <span className="capitalize">{self.move}</span> (Revealed)</p>
                ) : (
                  <p className="text-center mt-4 text-xl font-semibold">Make your move!</p>
                )}

                {opponent.move && self.move ? (
                  <p className="text-center mt-2 text-xl font-semibold">{opponent.name} played: <span className="capitalize">{opponent.move}</span> (Revealed)</p>
                ) : opponent.pendingMove ? (
                  <p className="text-center mt-2 text-xl font-semibold">{opponent.name} has chosen! Waiting for reveal...</p>
                ) : (
                  <p className="text-center mt-2 text-xl font-semibold">Waiting for {opponent.name} to choose...</p>
                )}
              </>
            )}

            {currentMatch.gameHistory && currentMatch.gameHistory.length > 0 && (
              <div className="mt-6 bg-purple-700 p-4 rounded-lg shadow-md">
                <h4 className="text-xl font-semibold mb-3 text-white">Individual Game Results: <span className="text-sm font-normal">(Total: {currentMatch.gamesPlayed})</span></h4> {/* Added total games count */}
                <ul className="space-y-2">
                  {currentMatch.gameHistory.map((gameRec, index) => (
                    <li key={index} className="flex flex-col items-start bg-purple-800 p-3 rounded-md text-sm text-gray-100">
                      <span className="font-bold">Game {gameRec.gameNum}:</span>
                      <span>{gameRec.player1.name} played {gameRec.player1.move}</span>
                      <span>{gameRec.player2.name} played {gameRec.player2.move}</span>
                      <span className="font-semibold mt-1">Winner: {gameRec.winner}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

        {isHost && allCurrentRoundMatchesAreFinished && playersRemaining > 1 && game.status === 'playing' && (
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

        <button
          onClick={() => setShowPlayerStatusModal(true)}
          className="mt-4 p-3 rounded-md text-md font-semibold transition duration-300 bg-purple-600 hover:bg-purple-700 text-white shadow-md"
        >
          Show Player Status
        </button>

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
        <PlayerStatusModal
          show={showPlayerStatusModal}
          onClose={() => setShowPlayerStatusModal(false)}
          players={game.players}
          matches={matches}
          currentUserId={userId}
        />
      </div>
    );
  };

  // Main render logic for App component
  // Provides all necessary state and setters via FirebaseContext to children
  return (
    <FirebaseContext.Provider value={{
      db, auth, userId, setUserId, displayName, setDisplayName,
      isAuthReady, currentPage, setCurrentPage, currentGameId, setCurrentGameId, game, setGame,
      finalWinner, setFinalWinner, showGameEndedModal, setShowGameEndedModal
    }}>
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        {
          (() => { // Conditional rendering based on currentPage state
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
