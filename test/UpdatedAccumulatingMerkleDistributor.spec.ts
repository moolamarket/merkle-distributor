import chai, { expect } from 'chai'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'
import { Contract, BigNumber, constants } from 'ethers'
import BalanceTree from '../src/balance-tree'

import Distributor from '../build/UpdatedAccumulatingMerkleDistributor.json'
import TestERC20 from '../build/TestERC20.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999,
}

const timeout = Date.now() + 10000000;
const testMerkleRoot1 = '0x0000000000000000000000000000000000000000000000000000000000000001';
const testMerkleRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000002';

describe('UpdatedAccumulatingMerkleDistributor', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'moo moo moo moo moo moo moo moo moo moo moo moo',
      gasLimit: 9999999,
    },
  })

  const wallets = provider.getWallets()
  const [wallet0, wallet1] = wallets

  let token: Contract
  beforeEach('deploy token', async () => {
    token = await deployContract(wallet0, TestERC20, ['Token', 'TKN', 0], overrides)
  })

  describe('#timeout', () => {
    it('returns the correct timeout', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      expect(await distributor.timeout()).to.eq(timeout)
    })
  })

  describe('#token', () => {
    it('returns the token address', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      expect(await distributor.token()).to.eq(token.address)
    })
  })

  describe('#allowedMerkleRoots', () => {
    it('initialize merkle root to false', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)

      expect(await distributor.allowedMerkleRoots(testMerkleRoot1)).to.eq(false)
      expect(await distributor.allowedMerkleRoots(testMerkleRoot2)).to.eq(false)
    })
  })

  describe('#claimedAmount', () => {
    it('initialize claimedAmount to 0', async () => {
      const distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      expect(await distributor.claimedAmount(wallet0.address)).to.eq(0)
      expect(await distributor.claimedAmount(wallet1.address)).to.eq(0)
    })
  })
  
  describe('#updateRoot', () => {
    it('should set the passed in merkle root to true in allowedMerkleRoots', async () => {
      const distributor = await deployContract(
        wallet0,
        Distributor,
        [token.address, wallet0.address, timeout],
        overrides
      )
      expect(await distributor.allowedMerkleRoots(testMerkleRoot1)).to.eq(false);
      await distributor.updateRoot(testMerkleRoot1);
      expect(await distributor.allowedMerkleRoots(testMerkleRoot1)).to.eq(true)
    });

    it("should revert if merkleRoot is already allowed", async() => {
      const distributor = await deployContract(
        wallet0,
        Distributor,
        [token.address, wallet0.address, timeout],
        overrides
      )
      await distributor.updateRoot(testMerkleRoot1)
      await expect(distributor.updateRoot(testMerkleRoot1)).to.be.revertedWith(
        'UpdatedAccumulatingMerkleDistributor: merkleRoot already exists.'
      )
    })

    it('should emit a RootAdded event', async() => {
      const distributor = await deployContract(
        wallet0,
        Distributor,
        [token.address, wallet0.address, timeout],
        overrides
      )

      await expect(distributor.updateRoot(testMerkleRoot1))
        .to.emit(distributor, 'RootAdded')
        .withArgs(testMerkleRoot1)
    })
  })

  describe('#recover',() => {
    it('should revert if _to is token address and time has not passed timeout yet', async() => {
        const distributor = await deployContract(
          wallet0,
          Distributor,
          [token.address, wallet0.address, timeout],
          overrides
        )

        await expect(
          distributor.recover(token.address, '0x01')
        ).to.be.revertedWith('UpdatedAccumulatingMerkleDistributor: not timed out yet.')
    })
  })
  
  describe('#claim for two account tree', () => {
    let distributor: Contract
    let tree: BalanceTree
    beforeEach('deploy', async () => {
      tree = new BalanceTree([
        { account: wallet0.address, amount: BigNumber.from(100) },
        { account: wallet1.address, amount: BigNumber.from(101) },
      ])
      distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      await distributor.updateRoot(tree.getHexRoot())
      await token.setBalance(distributor.address, 201)
    })

    it('should successfully claim', async () => {
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
      await expect(distributor.claim(0, wallet0.address, 100, tree.getHexRoot(), proof0, overrides))
        .to.emit(distributor, 'Claimed')
        .withArgs(0, wallet0.address, 100, tree.getHexRoot())
    })

    it('should not allow claiming the same amount again', async() => {
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
      await expect(distributor.claim(0, wallet0.address, 100, tree.getHexRoot(), proof0, overrides))
        .to.emit(distributor, 'Claimed')
        .withArgs(0, wallet0.address, 100, tree.getHexRoot())

      await expect(distributor.claim(0, wallet0.address, 100, tree.getHexRoot(), proof0, overrides)).to.be.revertedWith('UpdatedAccumulatingMerkleDistributor: Drop already claimed.')
    })

    it('should update claimedAmount after claiming', async() => {
      const amount = 100;
      const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(amount))
      await distributor.claim(0, wallet0.address, 100, tree.getHexRoot(), proof0, overrides)

      expect(await distributor.claimedAmount(wallet0.address)).to.equal(amount);
    })

    it('should revert if passed in _merkleRoot does not exist in allowedMerkleRoots', async () => {
      const distributor = await deployContract(
        wallet0,
        Distributor,
        [token.address, wallet0.address, timeout],
        overrides
      )

      await expect(distributor.claim(0, wallet1.address, 10, testMerkleRoot1, [testMerkleRoot1])).to.be.revertedWith('UpdatedAccumulatingMerkleDistributor: Invalid merkleRoot.')
    });

    it('should revert if merkleProof does not match', async() => {
      const otherTree = new BalanceTree([
        { account: wallet1.address, amount: BigNumber.from(300) },
      ]);
      
      await expect(
        distributor.claim(
          0,
          wallet0.address,
          100,
          tree.getHexRoot(),
          otherTree.getProof(0, wallet1.address, BigNumber.from(300)),
          overrides
        )
      ).to.be.revertedWith('UpdatedAccumulatingMerkleDistributor: Invalid proof.')
    })
  })

  describe('#claim for larger tree', () => {
    let distributor: Contract
    let tree: BalanceTree
    beforeEach('deploy', async () => {
      tree = new BalanceTree(
        wallets.map((wallet, ix) => {
          return { account: wallet.address, amount: BigNumber.from(ix + 1) }
        })
      )
      distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      await distributor.updateRoot(tree.getHexRoot());
      await token.setBalance(distributor.address, 201)
    });

    it('should successfully claim index 4', async() => {
      const idx = 4
      const amount = idx + 1
        const proof0 = tree.getProof(idx, wallets[idx].address, BigNumber.from(amount))
        await expect(distributor.claim(idx, wallets[idx].address, amount, tree.getHexRoot(), proof0, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(idx, wallets[idx].address, amount, tree.getHexRoot())
    })

    it('should successfully claim index 9', async() => {
      const idx = 9
      const amount = idx + 1
        const proof0 = tree.getProof(idx, wallets[idx].address, BigNumber.from(amount))
        await expect(distributor.claim(idx, wallets[idx].address, amount, tree.getHexRoot(), proof0, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(idx, wallets[idx].address, amount, tree.getHexRoot())
    })
  })

  describe('#claim for realistic size tree', () => {
    let distributor: Contract
    let tree: BalanceTree
    const NUM_LEAVES = 100_000
    const NUM_SAMPLES = 25
    const elements: { account: string; amount: BigNumber }[] = []
    for (let i = 0; i < NUM_LEAVES; i++) {
      const node = { account: wallet0.address, amount: BigNumber.from(100) }
      elements.push(node)
    }
    tree = new BalanceTree(elements)

    it('proof verification works', () => {
      const root = Buffer.from(tree.getHexRoot().slice(2), 'hex')
      for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
        const proof = tree
          .getProof(i, wallet0.address, BigNumber.from(100))
          .map((el) => Buffer.from(el.slice(2), 'hex'))
        const validProof = BalanceTree.verifyProof(i, wallet0.address, BigNumber.from(100), proof, root)
        expect(validProof).to.be.true
      }
    })

    beforeEach('deploy', async () => {
      distributor = await deployContract(wallet0, Distributor, [token.address, wallet0.address, timeout], overrides)
      await distributor.updateRoot(tree.getHexRoot())
      await token.setBalance(distributor.address, constants.MaxUint256)
    })

    it('should not allow double claims in random distribution', async () => {
      for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
        const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
        await distributor.claim(i, wallet0.address, 100, tree.getHexRoot(), proof, overrides)
        await expect(
          distributor.claim(i, wallet0.address, 100, tree.getHexRoot(), proof, overrides)
        ).to.be.revertedWith('UpdatedAccumulatingMerkleDistributor: Drop already claimed.')
      }
    })

  })
})
