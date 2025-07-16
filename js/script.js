// Access Firebase services from window
const { db, auth, firebase } = window.firebaseServices;
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// NFT Configuration with testnet support
const NFT_CONFIG = {
    contractAddresses: {
        '1': '0x32fc2529f6f696e4e5d263efA895ecb169c931b3', // Mainnet
        '5': '0x74F204d4E97f35f55e8d93176Ea9BC88e64bc61A', // Goerli Testnet
        '11155111': '0x74F204d4E97f35f55e8d93176Ea9BC88e64bc61A', // Sepolia Testnet
        '137': '0xabcdef1234567890abcdef1234567890abcdef12', // Polygon Mainnet
        '80001': '0xYourMumbaiContractAddress' // Mumbai Testnet
    },
    abi: [
        "function mintReceipt(address to, string memory uri) returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)"
    ],
    nftStorageApiKey: "66204e0d.1c6a79215f014d8aad3b42a300150728",
    testnetChains: ['5', '11155111', '80001'], // Testnet chain IDs
    testnetNames: {
        '5': 'Goerli',
        '11155111': 'Sepolia',
        '80001': 'Mumbai'
    }
};

// Map & App Variables
let map;
let routeControl;
let startPoint = null;
let destinationPoint = null;
let startMarker = null;
let destinationMarker = null;
let manualStartMode = false;
let manualDestinationMode = false;
let distanceInKm = 0;
let currentTransaction = null;
let userAddress = null;
let currentChainId = null;

// DOM Elements
const elements = {
    mapContainer: document.getElementById('map'),
    startPointInfo: document.getElementById('startPointInfo'),
    destinationInput: document.getElementById('destinationInput'),
    distanceResult: document.getElementById('distanceResult'),
    distanceInput: document.getElementById('distance'),
    buyerService: document.getElementById('buyerService'),
    buyerFields: document.getElementById('buyerFields'),
    hoursInput: document.getElementById('hours'),
    weightInput: document.getElementById('weight'),
    weightWarning: document.getElementById('weightWarning'),
    resultContainer: document.getElementById('resultContainer'),
    deliveryCost: document.getElementById('deliveryCost'),
    buyerServiceDetails: document.getElementById('buyerServiceDetails'),
    totalPrice: document.getElementById('totalPrice'),
    useMyLocationBtn: document.getElementById('useMyLocationBtn'),
    manualStartBtn: document.getElementById('manualStartBtn'),
    manualDestBtn: document.getElementById('manualDestBtn'),
    clearStartBtn: document.getElementById('clearStartBtn'),
    calculateRouteBtn: document.getElementById('calculateRouteBtn'),
    priceCalculatorForm: document.getElementById('priceCalculatorForm'),
    calculatePriceBtn: document.getElementById('calculatePriceBtn'),
    confirmBookingBtn: document.getElementById('confirmBookingBtn'),
    completeTransactionBtn: document.getElementById('completeTransactionBtn'),
    transactionsList: document.getElementById('transactionsList'),
    riderName: document.getElementById('riderName'),
    riderId: document.getElementById('riderId'),
    connectWalletBtn: document.getElementById('connectWalletBtn'),
    walletAddress: document.getElementById('walletAddress'),
    paymentStatus: document.getElementById('paymentStatus'),
    networkIndicator: document.getElementById('networkIndicator'),
    switchToTestnetBtn: document.getElementById('switchToTestnetBtn'),
    testnetFaucetBtn: document.getElementById('testnetFaucetBtn')
};

// Transaction history
const transactionHistory = [];

// ======================
// NFT Specific Functions (Updated for Testnets)
// ======================

async function switchToTestnet() {
    if (!window.ethereum) {
        alert("Web3 wallet not detected");
        return false;
    }

    try {
        // Default to Sepolia testnet
        const testnetChainId = '0xaa36a7'; // Sepolia chain ID
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: testnetChainId }]
        });
        return true;
    } catch (switchError) {
        // Handle network not added
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                       chainId: '0xaa36a7',
                        chainName: 'Sepolia Testnet',
                        nativeCurrency: {
                            name: 'Sepolia ETH',
                            symbol: 'ETH',
                            decimals: 18
                        },
                        rpcUrls: ['https://rpc.sepolia.org'],
                        blockExplorerUrls: ['https://sepolia.etherscan.io']
                    }]
                });
                return true;
            } catch (addError) {
                console.error("Failed to add testnet:", addError);
                return false;
            }
        }
        console.error("Network switch failed:", switchError);
        return false;
    }
}

async function checkCorrectNetwork() {
    if (!window.ethereum) return false;
    
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16).toString();
    
    // Update global chain ID
    currentChainId = chainId;
    
    // Update UI indicator
    updateNetworkIndicator(chainId);
    
    // Check if current network is supported
    if (NFT_CONFIG.contractAddresses[chainId]) {
        return true;
    }
    
    // Prompt to switch to testnet
    const shouldSwitch = confirm("Switch to testnet for NFT minting?");
    if (shouldSwitch) {
        return await switchToTestnet();
    }
    return false;
}

function updateNetworkIndicator(chainId) {
    const networkName = chainId === '11155111' ? 'Sepolia' : 
        NFT_CONFIG.testnetNames[chainId] || 
        (chainId === '1' ? 'Mainnet' : 
         chainId === '137' ? 'Polygon' : 'Unknown');
    
    const isTestnet = NFT_CONFIG.testnetChains.includes(chainId);
    elements.networkIndicator.textContent = `${networkName} ${isTestnet ? '(Testnet)' : ''}`;
    elements.networkIndicator.className = isTestnet ? 'testnet-indicator' : 'mainnet-indicator';
}

function generateNFTMetadata(transactionData, txHash) {
    const networkInfo = currentChainId === '11155111' 
        ? "Sepolia Testnet" 
        : (NFT_CONFIG.testnetChains.includes(currentChainId) ? "Testnet" : "Mainnet");
    
    return {
        name: `Delivery Receipt #${transactionData.id}`,
        description: `Bilis Paps Delivery Receipt for ${transactionData.riderInfo?.name || 'Customer'} on ${networkInfo}`,
        image: "https://i.ibb.co/9mZvzsqs/bilispaps.png",
        external_url: "https://bilispaps.com",
        attributes: [
            { trait_type: "From", value: transactionData.startPoint },
            { trait_type: "To", value: transactionData.destination },
            { trait_type: "Distance", value: `${transactionData.distance} km` },
            { trait_type: "Amount", value: transactionData.price },
            { trait_type: "Service Type", value: transactionData.buyerService === 'Yes' ? 'With Buyer Service' : 'Delivery Only' },
            { trait_type: "Rider", value: transactionData.riderInfo?.name || 'N/A' },
            { trait_type: "Booking ID", value: transactionData.riderInfo?.id || 'N/A' },
            { trait_type: "Payment TX Hash", value: txHash },
            { trait_type: "Status", value: transactionData.status },
            { trait_type: "Network Type", value: networkInfo },
            { trait_type: "Chain ID", value: currentChainId },
            { display_type: "date", trait_type: "Booking Date", value: Date.parse(transactionData.bookingTime) / 1000 }
        ]
    };
}

async function uploadToIPFSWithRetry(data, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch("https://api.nft.storage/upload", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${NFT_CONFIG.nftStorageApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const result = await response.json();
            if (!result.ok) throw new Error(`NFT.Storage error: ${result.error}`);
            
            return `https://ipfs.io/ipfs/${result.value.cid}`;
        } catch (error) {
            console.error(`Upload attempt ${i+1} failed:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

async function mintNFTReceipt(transactionData, txHash) {
    try {
        if (!await checkCorrectNetwork()) {
            throw new Error("Please switch to a supported network");
        }

        elements.paymentStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Minting NFT receipt...';
        
        // Generate enhanced metadata
        const metadata = generateNFTMetadata(transactionData, txHash);
        const metadataURL = await uploadToIPFSWithRetry(metadata);
        
        // Initialize contract
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const contractAddress = NFT_CONFIG.contractAddresses[currentChainId];
        
        if (!contractAddress) {
            throw new Error(`No contract address for chain ID ${currentChainId}`);
        }
        
        const contract = new ethers.Contract(contractAddress, NFT_CONFIG.abi, signer);
        
        // Mint with retry logic
        const tx = await contract.mintReceipt(userAddress, metadataURL);
        await tx.wait();
        
        // Get token ID from transaction logs
        const receipt = await provider.getTransactionReceipt(tx.hash);
        const event = receipt.logs.find(l => 
            l.topics[0] === ethers.utils.id("Transfer(address,address,uint256)")
        );
        
        const tokenId = event ? parseInt(event.topics[3]) : null;
        
        if (!tokenId) {
            throw new Error("Could not determine token ID from transaction");
        }
        
        // Update Firestore with NFT details
        await db.collection("transactions").doc(transactionData.id).update({
            nftReceipt: {
                tokenId: tokenId,
                metadataURL: metadataURL,
                mintTxHash: tx.hash,
                contractAddress: contractAddress,
                chainId: currentChainId,
                mintedAt: serverTimestamp()
            }
        });
        
        return { tokenId };
    } catch (error) {
        console.error("NFT minting failed:", error);
        elements.paymentStatus.innerHTML = `<div style="color: var(--danger);"><i class="fas fa-times-circle"></i> NFT minting failed: ${error.message}</div>`;
        throw error;
    }
}

function getOpenSeaLink(txn) {
    if (!txn.nftReceipt) return "#";
    
    const chainId = txn.nftReceipt.chainId;
    const isTestnet = NFT_CONFIG.testnetChains.includes(chainId);
    const baseURL = isTestnet 
        ? "https://testnets.opensea.io/assets" 
        : "https://opensea.io/assets";
    
    const chainName = 
        chainId === '1' ? 'ethereum' :
        chainId === '5' ? 'goerli' :
        chainId === '11155111' ? 'sepolia' :
        chainId === '137' ? 'matic' :
        chainId === '80001' ? 'mumbai' : '';
    
    return `${baseURL}/${chainName}/${txn.nftReceipt.contractAddress}/${txn.nftReceipt.tokenId}`;
}

function getEtherscanLink(txn) {
    if (!txn.nftReceipt) return "#";
    
    const chainId = txn.nftReceipt.chainId;
    let baseURL = "https://etherscan.io";
    
    if (chainId === '5') {
        baseURL = "https://goerli.etherscan.io";
    } else if (chainId === '11155111') {
        baseURL = "https://sepolia.etherscan.io";
    } else if (chainId === '80001') {
        baseURL = "https://mumbai.polygonscan.com";
    } else if (chainId === '137') {
        baseURL = "https://polygonscan.com";
    }
    
    return `${baseURL}/tx/${txn.nftReceipt.mintTxHash}`;
}

function displayMintedNFT(txn) {
    if (!txn.nftReceipt) return '';
    
    return `
        <div class="nft-receipt">
            <h4>NFT Receipt</h4>
            <a href="${getOpenSeaLink(txn)}" target="_blank">
                <img src="https://i.ibb.co/9mZvzsqs/bilispaps.png" alt="NFT Receipt" class="nft-image">
            </a>
            <div class="nft-links">
                <a href="${getOpenSeaLink(txn)}" target="_blank">View on OpenSea</a>
                <a href="${getEtherscanLink(txn)}" target="_blank">View on Etherscan</a>
                <a href="${txn.nftReceipt.metadataURL}" target="_blank">View Metadata</a>
            </div>
        </div>
    `;
}

function showTestnetFaucet() {
    if (!window.ethereum || !currentChainId) {
        alert("Connect wallet first to determine network");
        return;
    }
    
    let faucetUrl = '';
    
    switch(currentChainId) {
        case '5': // Goerli
            faucetUrl = 'https://goerlifaucet.com/';
            break;
        case '11155111': // Sepolia
            faucetUrl = 'https://sepoliafaucet.com/';
            break;
        case '80001': // Mumbai
            faucetUrl = 'https://mumbaifaucet.com/';
            break;
        default:
            alert("No faucet available for current network");
            return;
    }
    
    window.open(faucetUrl, '_blank');
}

// ======================
// Authentication Setup
// ======================

function showLoadingState() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-state';
    loadingDiv.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <p>Initializing application...</p>
    `;
    document.body.appendChild(loadingDiv);
    return loadingDiv;
}

function hideLoadingState() {
    const loadingElement = document.querySelector('.loading-state');
    if (loadingElement) {
        loadingElement.remove();
    }
}

// ======================
// Map Functions
// ======================

function initMap() {
    try {
        // Initialize map with default view
        map = L.map('map').setView([15.3192138, 120.8269231], 13);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(map);
        
        setupMapClickHandlers();
    } catch (error) {
        console.error("Map initialization failed:", error);
        showMapError("Failed to load map. Please refresh the page.");
    }
}

function setupMapClickHandlers() {
    map.on('click', function(e) {
        if (manualStartMode) {
            startPoint = [e.latlng.lat, e.latlng.lng];
            updateStartPoint();
            manualStartMode = false;
            elements.manualStartBtn.classList.remove('active-mode');
            map.setView(startPoint, 15);
        } else if (manualDestinationMode) {
            destinationPoint = [e.latlng.lat, e.latlng.lng];
            updateDestinationPoint();
            manualDestinationMode = false;
            elements.manualDestBtn.classList.remove('active-mode');
        }
    });
}

function showMapError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'map-error';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <p>${message}</p>
        <button onclick="window.location.reload()">Retry</button>
    `;
    elements.mapContainer.appendChild(errorDiv);
}

// ======================
// Location Functions
// ======================

function useMyLocation() {
    if (navigator.geolocation) {
        elements.useMyLocationBtn.disabled = true;
        elements.useMyLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';
        
        navigator.geolocation.getCurrentPosition(
            position => {
                startPoint = [position.coords.latitude, position.coords.longitude];
                updateStartPoint();
                map.setView(startPoint, 15);
                elements.useMyLocationBtn.disabled = false;
                elements.useMyLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
            },
            error => {
                alert("Error getting location: " + error.message);
                elements.useMyLocationBtn.disabled = false;
                elements.useMyLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
            },
            { timeout: 10000 }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

function activateManualStartMode() {
    manualStartMode = true;
    manualDestinationMode = false;
    elements.manualStartBtn.classList.add('active-mode');
    elements.manualDestBtn.classList.remove('active-mode');
    alert("Click on the map to set start point");
}

function activateManualDestMode() {
    manualDestinationMode = true;
    manualStartMode = false;
    elements.manualDestBtn.classList.add('active-mode');
    elements.manualStartBtn.classList.remove('active-mode');
    alert("Click on the map to set destination point");
}

function updateStartPoint() {
    if (startMarker) map.removeLayer(startMarker);
    
    startMarker = L.marker(startPoint, {
        icon: new L.Icon({
            iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
            iconSize: [32, 32]
        })
    }).addTo(map)
      .bindPopup("Start Point").openPopup();
    
    elements.startPointInfo.textContent = `Start: ${startPoint[0].toFixed(6)}, ${startPoint[1].toFixed(6)}`;
    elements.clearStartBtn.disabled = false;
    checkRouteReady();
}

function updateDestinationPoint() {
    if (destinationMarker) map.removeLayer(destinationMarker);
    
    destinationMarker = L.marker(destinationPoint, {
        icon: new L.Icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
            iconSize: [32, 32]
        })
    }).addTo(map)
      .bindPopup("Destination").openPopup();
    
    elements.destinationInput.value = `${destinationPoint[0].toFixed(6)}, ${destinationPoint[1].toFixed(6)}`;
    checkRouteReady();
}

function checkRouteReady() {
    elements.calculateRouteBtn.disabled = !(startPoint && destinationPoint);
}

function clearStartPoint() {
    if (startMarker) map.removeLayer(startMarker);
    if (routeControl) map.removeControl(routeControl);
    startPoint = null;
    startMarker = null;
    routeControl = null;
    elements.startPointInfo.textContent = "Start point not set";
    elements.clearStartBtn.disabled = true;
    elements.calculateRouteBtn.disabled = true;
    elements.distanceResult.textContent = "Waiting for route calculation...";
    elements.distanceInput.value = "0";
    elements.calculatePriceBtn.disabled = true;
    elements.resultContainer.style.display = 'none';
}

// ======================
// Route Calculation
// ======================

async function calculateRoute() {
    if (!startPoint || !destinationPoint) {
        alert("Please set both start and destination points");
        return;
    }

    try {
        elements.calculateRouteBtn.disabled = true;
        elements.calculateRouteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
        elements.distanceResult.textContent = "Calculating route...";
        
        if (routeControl) map.removeControl(routeControl);
        
        routeControl = L.Routing.control({
            waypoints: [
                L.latLng(startPoint[0], startPoint[1]),
                L.latLng(destinationPoint[0], destinationPoint[1])
            ],
            routeWhileDragging: true,
            show: false,
            lineOptions: {
                styles: [{color: '#4CAF50', opacity: 0.7, weight: 5}]
            }
        }).addTo(map);
        
        routeControl.on('routesfound', function(e) {
            const routes = e.routes;
            const distance = routes[0].summary.totalDistance / 1000;
            distanceInKm = distance.toFixed(2);
            elements.distanceInput.value = distanceInKm;
            elements.distanceResult.textContent = `Distance: ${distanceInKm} km`;
            elements.calculatePriceBtn.disabled = false;
            elements.calculateRouteBtn.disabled = false;
            elements.calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> Calculate Route';
        });
        
        routeControl.on('routingerror', function(e) {
            console.error("Routing error:", e.error);
            elements.distanceResult.textContent = "Error calculating route";
            elements.calculateRouteBtn.disabled = false;
            elements.calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> Calculate Route';
        });
        
    } catch (error) {
        console.error("Route calculation failed:", error);
        elements.distanceResult.textContent = "Error calculating route";
        elements.calculateRouteBtn.disabled = false;
        elements.calculateRouteBtn.innerHTML = '<i class="fas fa-route"></i> Calculate Route';
    }
}

// ======================
// Price Calculation
// ======================

function toggleBuyerFields() {
    elements.buyerFields.style.display = elements.buyerService.checked ? 'block' : 'none';
}

function checkWeightLimit() {
    const weight = parseFloat(elements.weightInput.value) || 0;
    elements.weightWarning.style.display = weight > 7 ? 'flex' : 'none';
}

function calculatePrice(e) {
    e.preventDefault();
    
    const distance = parseFloat(elements.distanceInput.value) || 0;
    const hasBuyerService = elements.buyerService.checked;
    const hours = parseFloat(elements.hoursInput.value) || 0;
    const weight = parseFloat(elements.weightInput.value) || 0;
    
    // Validate inputs
    if (isNaN(distance)) {
        alert("Please calculate a route first");
        return;
    }
    
    if (hasBuyerService && (isNaN(hours) || hours < 0.5)) {
        alert("Please enter valid hours (minimum 0.5)");
        return;
    }
    
    if (hasBuyerService && (isNaN(weight) || weight <= 0)) {
        alert("Please enter valid weight");
        return;
    }
    
    // Calculate base price (₱60 base + ₱10 per km after 4km)
    let basePrice = 60;
    let extraKm = 0;
    const perKm = 10;
    
    if (distance > 4) {
        extraKm = distance - 4;
        basePrice += extraKm * perKm;
    }

    // Calculate buyer service costs if enabled
    let buyerCost = 0;
    const buyerRate = 70;
    let extraWeightCost = 0;
    
    if (hasBuyerService) {
        buyerCost = hours * buyerRate;
        
        if (weight > 7) {
            extraWeightCost = (weight - 7) * 10;
        }
    }
    
    const total = basePrice + buyerCost + extraWeightCost;
    
    // Update UI
    elements.deliveryCost.innerHTML = `
        <p><strong>Delivery Cost:</strong></p>
        <p>Base Price: ₱60</p>
        ${extraKm > 0 ? `<p>Extra ${extraKm.toFixed(2)} km × ₱${perKm} = ₱${(extraKm * perKm).toFixed(2)}</p>` : ''}
    `;

    if (hasBuyerService) {
        elements.buyerServiceDetails.innerHTML = `
            <p><strong>Buyer Service:</strong></p>
            <p>${hours} hour(s) × ₱${buyerRate} = ₱${buyerCost.toFixed(2)}</p>
            ${weight > 7 ? `<p>Extra Weight: ${(weight-7).toFixed(1)} kg × ₱10 = ₱${extraWeightCost.toFixed(2)}</p>` : ''}
        `;
    } else {
        elements.buyerServiceDetails.innerHTML = '';
    }

    elements.totalPrice.innerHTML = `
        <p>Total Price: ₱${total.toFixed(2)}</p>
        <button class="pay-with-crypto" data-amount="${total.toFixed(2)}">
            <i class="fab fa-ethereum"></i> Pay with Crypto
        </button>
    `;
    elements.resultContainer.style.display = 'block';
    elements.confirmBookingBtn.disabled = false;
}

// ======================
// Firestore Transactions
// ======================

async function confirmBooking() {
    if (!auth.currentUser) {
        alert("System is initializing, please try again in a moment");
        return;
    }

    // Validate rider info
    if (!elements.riderName.value.trim()) {
        alert("Please enter rider name");
        return;
    }
    if (!elements.riderId.value.trim()) {
        alert("Please enter booking ID");
        return;
    }

    try {
        elements.confirmBookingBtn.disabled = true;
        elements.confirmBookingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        const transactionData = {
            bookingTime: serverTimestamp(),
            startPoint: elements.startPointInfo.textContent,
            destination: elements.destinationInput.value,
            distance: elements.distanceInput.value,
            price: elements.totalPrice.textContent.replace('Total Price: ₱', ''),
            status: 'Pending',
            buyerService: elements.buyerService.checked ? 'Yes' : 'No',
            hours: elements.buyerService.checked ? elements.hoursInput.value : '0',
            weight: elements.buyerService.checked ? elements.weightInput.value : '0',
            riderInfo: {
                name: elements.riderName.value.trim(),
                id: elements.riderId.value.trim()
            }
        };

        const docRef = await db.collection("transactions").add(transactionData);
        
        transactionData.id = docRef.id;
        currentTransaction = transactionData;
        addToTransactionHistory(transactionData);
        elements.completeTransactionBtn.disabled = false;
        elements.confirmBookingBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking';

        alert('Booking confirmed!');
    } catch (error) {
        console.error("Error saving booking:", error);
        alert("Failed to save booking");
        elements.confirmBookingBtn.disabled = false;
        elements.confirmBookingBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Booking';
    }
}

async function completeCurrentTransaction() {
    if (!currentTransaction) return;
    
    if (!auth.currentUser) {
        alert("System is initializing, please try again in a moment");
        return;
    }

    if (!elements.riderName.value.trim()) {
        alert("Please enter rider name");
        return;
    }
    if (!elements.riderId.value.trim()) {
        alert("Please enter rider ID");
        return;
    }

    try {
        elements.completeTransactionBtn.disabled = true;
        elements.completeTransactionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        await db.collection("transactions").doc(currentTransaction.id).update({
            status: "Completed",
            completedAt: serverTimestamp(),
            completedBy: {
                name: elements.riderName.value.trim(),
                id: elements.riderId.value.trim()
            }
        });

        currentTransaction.status = "Completed";
        currentTransaction.completedAt = new Date().toISOString();
        currentTransaction.completedBy = {
            name: elements.riderName.value.trim(),
            id: elements.riderId.value.trim()
        };
        renderTransactionHistory();
        resetTransaction();
        elements.completeTransactionBtn.innerHTML = '<i class="fas fa-check-double"></i> Complete Transaction';
        
        alert('Transaction completed!');
    } catch (error) {
        console.error("Error completing transaction:", error);
        alert("Failed to complete transaction");
        elements.completeTransactionBtn.disabled = false;
        elements.completeTransactionBtn.innerHTML = '<i class="fas fa-check-double"></i> Complete Transaction';
    }
}

async function completeTransaction(index) {
    currentTransaction = transactionHistory[index];
    await completeCurrentTransaction();
}

async function loadInitialTransactions() {
    try {
        const snapshot = await db.collection("transactions")
            .orderBy("bookingTime", "desc")
            .limit(5)
            .get();
        
        transactionHistory.length = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            if (data.bookingTime && data.bookingTime.toDate) {
                data.bookingTime = data.bookingTime.toDate().toISOString();
            }
            if (data.completedAt && data.completedAt.toDate) {
                data.completedAt = data.completedAt.toDate().toISOString();
            }
            addToTransactionHistory(data);
        });
    } catch (error) {
        console.error("Error loading transactions:", error);
    }
}

function addToTransactionHistory(transaction) {
    transactionHistory.unshift(transaction);
    if (transactionHistory.length > 5) transactionHistory.pop();
    renderTransactionHistory();
}

function renderTransactionHistory() {
    elements.transactionsList.innerHTML = transactionHistory
        .map((txn, index) => `
            <div class="transaction-item">
                <p><strong>${formatDate(txn.bookingTime)}</strong></p>
                <p>From: ${txn.startPoint || 'N/A'}</p>
                <p>To: ${txn.destination || 'N/A'}</p>
                <p>Distance: ${txn.distance || '0'} km</p>
                <p>Price: ₱${txn.price || '0'}</p>
                ${txn.cryptoPayment ? `
                    <p>💰 Paid via Crypto</p>
                    <p>🔗 TX Hash: ${txn.cryptoPayment.txHash.substring(0, 10)}...</p>
                ` : ''}
                <p>Booked by: ${txn.riderInfo?.name || 'N/A'} (ID: ${txn.riderInfo?.id || 'N/A'})</p>
                ${txn.completedAt ? `
                    <p>Completed at: ${formatDate(txn.completedAt)}</p>
                    <p>Completed by: ${txn.completedBy?.name || 'N/A'} (ID: ${txn.completedBy?.id || 'N/A'})</p>
                ` : ''}
                <p class="status-${txn.status.toLowerCase()}">Status: ${txn.status}</p>
                ${displayMintedNFT(txn)}
                ${txn.status === 'Pending' ? 
                    `<button class="complete-btn" data-index="${index}">Mark as Completed</button>` : ''}
            </div>
        `)
        .join('');
}

function resetTransaction() {
    currentTransaction = null;
    elements.confirmBookingBtn.disabled = true;
    elements.completeTransactionBtn.disabled = true;
}

// ======================
// Utility Functions
// ======================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
}

function updateCopyrightYear() {
    document.getElementById('year').textContent = new Date().getFullYear();
}

// ======================
// Web3 Functions (Updated for Testnets)
// ======================

async function connectWallet() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAddress = accounts[0];
            
            // Get current network
            const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
            currentChainId = parseInt(chainIdHex, 16).toString();
            updateNetworkIndicator(currentChainId);
            
            elements.walletAddress.textContent = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
            elements.connectWalletBtn.innerHTML = '<i class="fas fa-wallet"></i> Wallet Connected';
            return true;
        } catch (error) {
            console.error("Wallet connection error:", error);
            alert("Failed to connect wallet. Please try again.");
            return false;
        }
    } else {
        alert("Please install MetaMask or another Web3 wallet");
        return false;
    }
}

async function payWithCrypto(amountInPesos) {
    if (!userAddress && !(await connectWallet())) {
        return false;
    }

    try {
        elements.paymentStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing payment...';
        
        // Switch to testnet if needed
        if (!await checkCorrectNetwork()) {
            throw new Error("Please switch to a supported network");
        }
        
        // Use testnet recipient for test networks
        const isTestnet = NFT_CONFIG.testnetChains.includes(currentChainId);
        const recipient = isTestnet 
            ? "0x74F204d4E97f35f55e8d93176Ea9BC88e64bc61A" 
            : "0x74F204d4E97f35f55e8d93176Ea9BC88e64bc61A";
        
        // Conversion rate (adjust as needed)
        const ethAmount = (amountInPesos * 0.000007).toFixed(6);
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        
        const txParams = {
            to: recipient,
            value: ethers.utils.parseEther(ethAmount)
        };

        // Show confirmation dialog with transaction details
        const shouldProceed = confirm(`You are about to send ${ethAmount} ETH (≈₱${amountInPesos.toFixed(2)}) for this delivery. Proceed?`);
        if (!shouldProceed) {
            elements.paymentStatus.innerHTML = '❌ Payment canceled by user';
            return false;
        }

        // Send transaction and get hash
        const tx = await signer.sendTransaction(txParams);
        const txHash = tx.hash;

        // Save transaction to Firestore using txHash
        if (currentTransaction?.id) {
            await db.collection("transactions").doc(currentTransaction.id).update({
                cryptoPayment: {
                    txHash: txHash,
                    ethAmount: ethAmount,
                    pesoAmount: amountInPesos.toFixed(2),
                    wallet: userAddress,
                    paidAt: serverTimestamp()
                },
                status: "Paid"
            });
            
            // Mint NFT receipt using txHash
            const { tokenId } = await mintNFTReceipt(currentTransaction, txHash);
            
            await db.collection("transactions").doc(currentTransaction.id).update({
                'nftReceipt.tokenId': tokenId
            });
        }

        // Determine explorer URL based on network
        let explorerURL;
        if (currentChainId === '11155111') { // Sepolia
            explorerURL = `https://sepolia.etherscan.io/tx/${txHash}`;
        } else if (currentChainId === '5') { // Goerli
            explorerURL = `https://goerli.etherscan.io/tx/${txHash}`;
        } else if (currentChainId === '1') { // Mainnet
            explorerURL = `https://etherscan.io/tx/${txHash}`;
        } else if (currentChainId === '137') { // Polygon
            explorerURL = `https://polygonscan.com/tx/${txHash}`;
        } else if (currentChainId === '80001') { // Mumbai
            explorerURL = `https://mumbai.polygonscan.com/tx/${txHash}`;
        } else {
            explorerURL = "#";
        }

        elements.paymentStatus.innerHTML = `
            <div style="color: var(--success);">
                <i class="fas fa-check-circle"></i> Payment successful! 
                <br>TX Hash: <a href="${explorerURL}" target="_blank">${txHash.substring(0, 10)}...</a>
                <br>NFT Receipt is being generated...
            </div>
        `;
        
        // Refresh transaction history to show NFT
        setTimeout(() => {
            loadInitialTransactions();
        }, 3000);
        
        return true;
    } catch (error) {
        console.error("Payment failed:", error);
        let errorMessage = "Payment failed";
        
        if (error.code === 'ACTION_REJECTED') {
            errorMessage = "You rejected the transaction";
        } else if (error.message.includes('insufficient funds')) {
            errorMessage = "Insufficient funds";
            if (NFT_CONFIG.testnetChains.includes(currentChainId)) {
                errorMessage += " - Use the faucet button to get test ETH";
            }
        } else if (error.message.includes('gas')) {
            errorMessage = "Gas estimation failed";
        } else if (error.message.includes('network')) {
            errorMessage = "Wrong network detected";
        }
        
        elements.paymentStatus.innerHTML = `<div style="color: var(--danger);"><i class="fas fa-times-circle"></i> ${errorMessage}</div>`;
        return false;
    }
}

// ======================
// Event Listeners Setup (Updated)
// ======================

function setupEventListeners() {
    // Map controls
    elements.useMyLocationBtn.addEventListener('click', useMyLocation);
    elements.manualStartBtn.addEventListener('click', activateManualStartMode);
    elements.manualDestBtn.addEventListener('click', activateManualDestMode);
    elements.clearStartBtn.addEventListener('click', clearStartPoint);
    elements.calculateRouteBtn.addEventListener('click', calculateRoute);
    
    // Form submissions
    elements.priceCalculatorForm.addEventListener('submit', calculatePrice);
    
    // Checkbox and input changes
    elements.buyerService.addEventListener('change', toggleBuyerFields);
    elements.weightInput.addEventListener('input', checkWeightLimit);
    
    // Transaction buttons
    elements.confirmBookingBtn.addEventListener('click', confirmBooking);
    elements.completeTransactionBtn.addEventListener('click', completeCurrentTransaction);
    
    // Web3 buttons
    elements.connectWalletBtn.addEventListener('click', connectWallet);
    elements.switchToTestnetBtn.addEventListener('click', switchToTestnet);
    elements.testnetFaucetBtn.addEventListener('click', showTestnetFaucet);
    
    // Transaction history clicks
    elements.transactionsList.addEventListener('click', function(e) {
        if (e.target.classList.contains('complete-btn')) {
            completeTransaction(parseInt(e.target.dataset.index));
        }
    });
    
    // Crypto payment button
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('pay-with-crypto')) {
            const amount = parseFloat(e.target.dataset.amount);
            payWithCrypto(amount);
        }
    });
    
    // Network change detection
    if (window.ethereum) {
        window.ethereum.on('chainChanged', (chainIdHex) => {
            currentChainId = parseInt(chainIdHex, 16).toString();
            updateNetworkIndicator(currentChainId);
        });
    }
}

// ======================
// Application Initialization
// ======================

async function initializeApp() {
    const loadingElement = showLoadingState();
    
    try {
        // Initialize Firebase Auth
        await auth.signInAnonymously();
        console.log("Anonymous authentication successful");
        
        // Set up auth state observer
        auth.onAuthStateChanged((user) => {
            if (user) {
                console.log("User is signed in:", user.uid);
                // Initialize application components
                initMap();
                setupEventListeners();
                loadInitialTransactions();
                updateCopyrightYear();
                toggleBuyerFields();
                checkWeightLimit();
                
                // Initialize network indicator
                if (window.ethereum) {
                    window.ethereum.request({ method: 'eth_chainId' })
                        .then(chainIdHex => {
                            currentChainId = parseInt(chainIdHex, 16).toString();
                            updateNetworkIndicator(currentChainId);
                        });
                }
                
                hideLoadingState();
            } else {
                console.log("User is signed out");
                // Handle signed out state if needed
                hideLoadingState();
                showMapError("Authentication failed. Please refresh.");
            }
        });
    } catch (error) {
        console.error("Initialization error:", error);
        hideLoadingState();
        showMapError("System initialization failed. Please refresh.");
        // Retry after 5 seconds
        setTimeout(initializeApp, 5000);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);
